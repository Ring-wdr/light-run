package expo.modules.sharetarget

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
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

class SaveUnsupportedException :
  CodedException("ERR_SAVE_UNSUPPORTED", "Android 10 이상에서만 바로 저장할 수 있어요.", null)

class SaveFailedException :
  CodedException("ERR_SAVE_FAILED", "사진을 저장하지 못했어요.", null)

/** 사진 앱에서 보이는 폴더: Pictures/LightRun */
private const val ALBUM = "LightRun"

/**
 * 공유 시트를 거치지 않고 특정 앱(카카오톡 등)으로 이미지를 바로 보낸다.
 * 앱 캐시의 파일을 FileProvider content:// URI로 바꿔 ACTION_SEND 인텐트에 담는다.
 * 이미지 저장은 MediaStore에 넣는다(Android 10+는 저장소 권한이 필요 없다).
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

    // Android 9 이하는 WRITE_EXTERNAL_STORAGE 런타임 권한이 필요해서 지원하지 않는다(JS가 공유 시트로 안내)
    Function("saveImage") { fileUrl: String, displayName: String, mimeType: String ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        saveToPictures(fileOf(fileUrl), displayName, mimeType)
      } else {
        throw SaveUnsupportedException()
      }
    }
  }

  @RequiresApi(Build.VERSION_CODES.Q)
  private fun saveToPictures(file: File, displayName: String, mimeType: String) {
    val resolver = context.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
      put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
      put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$ALBUM")
      // 다 쓰기 전에는 사진 앱에 보이지 않게
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: throw SaveFailedException()
    try {
      val out = resolver.openOutputStream(uri) ?: throw SaveFailedException()
      out.use { o -> file.inputStream().use { it.copyTo(o) } }
      values.clear()
      values.put(MediaStore.MediaColumns.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
    } catch (e: Exception) {
      resolver.delete(uri, null, null)
      throw e
    }
  }

  private fun fileOf(fileUrl: String): File {
    val path = Uri.parse(fileUrl).path ?: throw InvalidFileException(fileUrl)
    val file = File(path)
    if (!file.exists()) throw InvalidFileException(fileUrl)
    return file
  }

  private fun contentUriOf(fileUrl: String): Uri =
    FileProvider.getUriForFile(context, "${context.packageName}.ShareTargetFileProvider", fileOf(fileUrl))
}
