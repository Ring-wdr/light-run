package expo.modules.appupdate

import android.app.Activity
import android.content.Context
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google Play 인앱 업데이트(유연한 업데이트, FLEXIBLE).
 * Play에서 설치한 앱(비공개·내부 테스트 트랙 포함)에서만 동작한다. 사이드로드·로컬 빌드는 check가 실패한다.
 *
 * 흐름: check → startFlexible(Play가 아래쪽에 업데이트 창을 띄운다) → 사용자가 받으면 뒤에서 내려받는다
 * → onStateChange가 downloaded를 알리면 JS가 다시 시작할지 묻고 completeUpdate로 설치·재시작한다.
 */
class AppUpdateModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var manager: AppUpdateManager? = null

  private val listener = InstallStateUpdatedListener { state ->
    sendEvent(
      "onStateChange",
      mapOf(
        "status" to statusName(state.installStatus()),
        "bytesDownloaded" to state.bytesDownloaded().toDouble(),
        "totalBytes" to state.totalBytesToDownload().toDouble(),
      ),
    )
  }

  /** 처음 쓸 때 만들고 진행 상황 리스너를 건다 */
  private fun manager(): AppUpdateManager =
    manager ?: AppUpdateManagerFactory.create(context.applicationContext).also {
      it.registerListener(listener)
      manager = it
    }

  override fun definition() = ModuleDefinition {
    Name("AppUpdate")

    Events("onStateChange")

    OnDestroy {
      manager?.unregisterListener(listener)
      manager = null
    }

    /** Play에 새 버전이 있는지와 내려받기 상태 */
    AsyncFunction("check") { promise: Promise ->
      manager().appUpdateInfo
        .addOnSuccessListener { info -> promise.resolve(infoMap(info)) }
        .addOnFailureListener { e -> promise.reject("ERR_APP_UPDATE_CHECK", e.message, e) }
    }

    /**
     * Play의 유연한 업데이트 창을 띄운다.
     * - "accepted": 사용자가 업데이트를 골랐다(뒤에서 내려받기 시작)
     * - "declined": 사용자가 창을 닫거나 거절했다
     * - "unavailable": 창을 띄우지 못했다(화면 없음·업데이트가 사라짐·유연한 업데이트 불가)
     * Play 오류는 reject한다. 사용자가 보지 못한 창은 "declined"로 치지 않는다
     */
    AsyncFunction("startFlexible") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve("unavailable")
        return@AsyncFunction
      }
      val m = manager()
      m.appUpdateInfo
        .addOnSuccessListener { info ->
          val ok = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
            info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
          if (!ok) {
            promise.resolve("unavailable")
            return@addOnSuccessListener
          }
          m.startUpdateFlow(info, activity, AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE))
            .addOnSuccessListener { code ->
              promise.resolve(
                when (code) {
                  Activity.RESULT_OK -> "accepted"
                  Activity.RESULT_CANCELED -> "declined"
                  // ActivityResult.RESULT_IN_APP_UPDATE_FAILED 등: 사용자가 거절한 게 아니다
                  else -> "unavailable"
                },
              )
            }
            .addOnFailureListener { e -> promise.reject("ERR_APP_UPDATE_FLOW", e.message, e) }
        }
        .addOnFailureListener { e -> promise.reject("ERR_APP_UPDATE_CHECK", e.message, e) }
    }.runOnQueue(Queues.MAIN)

    /** 내려받은 업데이트를 설치한다. 앱이 다시 시작된다 */
    AsyncFunction("completeUpdate") { promise: Promise ->
      manager().completeUpdate()
        .addOnSuccessListener { promise.resolve() }
        .addOnFailureListener { e -> promise.reject("ERR_APP_UPDATE_INSTALL", e.message, e) }
    }
  }

  private fun infoMap(info: AppUpdateInfo): Map<String, Any?> = mapOf(
    "available" to (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE),
    "versionCode" to info.availableVersionCode(),
    "flexibleAllowed" to info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
    "status" to statusName(info.installStatus()),
  )

  private fun statusName(status: Int): String = when (status) {
    InstallStatus.PENDING -> "pending"
    InstallStatus.DOWNLOADING -> "downloading"
    InstallStatus.DOWNLOADED -> "downloaded"
    InstallStatus.INSTALLING -> "installing"
    InstallStatus.INSTALLED -> "installed"
    InstallStatus.FAILED -> "failed"
    InstallStatus.CANCELED -> "canceled"
    else -> "unknown"
  }
}
