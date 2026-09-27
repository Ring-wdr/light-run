package expo.modules.sharetarget

import androidx.core.content.FileProvider

/** 다른 모듈의 FileProvider와 authority가 겹치지 않도록 따로 둔다 */
class ShareTargetFileProvider : FileProvider()
