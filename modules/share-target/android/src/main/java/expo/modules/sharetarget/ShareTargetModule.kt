package expo.modules.sharetarget

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class AppNotInstalledException(packageName: String) :
  CodedException("ERR_APP_NOT_INSTALLED", "$packageName 앱이 설치되어 있지 않아요.", null)

class InvalidFileException(url: String) :
  CodedException("ERR_INVALID_FILE", "공유할 파일을 찾을 수 없어요: $url", null)

/**
 * 공유 시트를 거치지 않고 특정 앱(카카오톡 등)으로 이미지를 바로 보낸다.
 * 앱 캐시의 파일을 FileProvider content:// URI로 바꿔 ACTION_SEND 인텐트에 담는다.
 */
class ShareTargetModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ShareTarget")

    Function("isInstalled") { packageName: String ->
      try {
        context.packageManager.getPackageInfo(packageName, 0)
        true
      } catch (_: PackageManager.NameNotFoundException) {
        false
      }
    }

    Function("shareImage") { packageName: String, fileUrl: String, mimeType: String, text: String? ->
      val uri = contentUriOf(fileUrl)
      val intent = Intent(Intent.ACTION_SEND).apply {
        setPackage(packageName)
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        if (text != null) putExtra(Intent.EXTRA_TEXT, text)
        // Android 10+는 ClipData로 읽기 권한이 넘어간다
        clipData = ClipData.newRawUri(null, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.grantUriPermission(packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      try {
        appContext.throwingActivity.startActivity(intent)
      } catch (_: ActivityNotFoundException) {
        throw AppNotInstalledException(packageName)
      }
    }
  }

  private fun contentUriOf(fileUrl: String): Uri {
    val path = Uri.parse(fileUrl).path ?: throw InvalidFileException(fileUrl)
    val file = File(path)
    if (!file.exists()) throw InvalidFileException(fileUrl)
    return FileProvider.getUriForFile(context, "${context.packageName}.ShareTargetFileProvider", file)
  }
}
