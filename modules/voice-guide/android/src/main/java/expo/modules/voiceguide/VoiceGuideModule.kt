package expo.modules.voiceguide

import android.content.Context
import android.media.AudioAttributes
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/**
 * 시간 음성 안내(Android). JS가 정한 "몇 시에 무엇을 말할지" 목록을 받아 네이티브에서 직접 말한다.
 *
 * JS 타이머와 위치 태스크 전달은 화면이 꺼지거나 홈으로 나가면 멈추거나 늦어진다. 그래서
 * - 시각 확인은 이 모듈의 스레드가 1초마다 벽시계(System.currentTimeMillis)로 한다.
 * - 안내가 남아 있는 동안만 PARTIAL_WAKE_LOCK으로 CPU를 깨워 둔다(위치 포그라운드 서비스가 프로세스를 살려 둔다).
 * - TextToSpeech는 applicationContext로 만들고 화면(Activity)이 없어져도 끄지 않는다.
 *   (expo-speech는 Activity가 없어지면 TTS를 shutdown해서 그 뒤로 말하지 못한다)
 */
class VoiceGuideModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VoiceGuide")

    /** 바로 말한다. flush면 앞서 말하던 것과 대기 중인 말을 버린다 */
    Function("speak") { text: String, flush: Boolean ->
      VoiceGuide.speak(context, text, flush)
    }

    /** 예약을 통째로 바꾼다. atMs는 벽시계(ms, Date.now() 기준), texts와 같은 길이 */
    Function("schedule") { atMs: List<Double>, texts: List<String> ->
      VoiceGuide.schedule(context, atMs.map { it.toLong() }.zip(texts))
    }

    /** 예약을 모두 지운다(일시정지·종료·끔) */
    Function("cancel") {
      VoiceGuide.cancel()
    }

    /** 지금 말하는 것과 대기 중인 말을 멈춘다 */
    Function("stop") {
      VoiceGuide.stopSpeaking()
    }
  }
}

/** 프로세스에 하나. 모든 상태는 thread의 핸들러에서만 바꾼다 */
private object VoiceGuide {
  private const val TICK_MS = 1_000L
  /** 이보다 오래 지난 예약은 말하지 않는다(프로세스가 멈췄다 깨어난 경우 등) */
  private const val STALE_MS = 60_000L
  private const val TAG = "light-run:voice"

  private val thread = HandlerThread("light-run-voice").apply { start() }
  private val handler = Handler(thread.looper)

  private var tts: TextToSpeech? = null
  private var ready = false
  private val pending = ArrayList<Pair<String, Boolean>>()
  private var utteranceId = 0

  /** (벽시계 ms, 문구) 시각순 */
  private var queue: List<Pair<Long, String>> = emptyList()
  private var wakeLock: PowerManager.WakeLock? = null

  private val tick = object : Runnable {
    override fun run() {
      val now = System.currentTimeMillis()
      val due = queue.takeWhile { it.first <= now }
      if (due.isNotEmpty()) {
        queue = queue.drop(due.size)
        // 여러 개가 한꺼번에 밀렸으면 마지막 하나만 말한다(한 번에 한 문장)
        val last = due.last()
        if (now - last.first <= STALE_MS) speakNow(last.second, false)
      }
      if (queue.isEmpty()) releaseWakeLock() else handler.postDelayed(this, TICK_MS)
    }
  }

  fun speak(context: Context, text: String, flush: Boolean) {
    val app = context.applicationContext
    handler.post {
      ensureTts(app)
      speakNow(text, flush)
    }
  }

  fun schedule(context: Context, items: List<Pair<Long, String>>) {
    val app = context.applicationContext
    handler.post {
      handler.removeCallbacks(tick)
      queue = items.sortedBy { it.first }
      if (queue.isEmpty()) {
        releaseWakeLock()
        return@post
      }
      ensureTts(app)
      acquireWakeLock(app, queue.last().first - System.currentTimeMillis() + STALE_MS)
      handler.post(tick)
    }
  }

  fun cancel() {
    handler.post {
      handler.removeCallbacks(tick)
      queue = emptyList()
      releaseWakeLock()
    }
  }

  fun stopSpeaking() {
    handler.post {
      pending.clear()
      tts?.stop()
    }
  }

  private fun speakNow(text: String, flush: Boolean) {
    val engine = tts
    if (engine == null || !ready) {
      if (flush) pending.clear()
      pending.add(text to flush)
      return
    }
    val mode = if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
    engine.speak(text, mode, null, "light-run-${utteranceId++}")
  }

  private fun ensureTts(app: Context) {
    if (tts != null) return
    ready = false
    tts = TextToSpeech(app) { status ->
      handler.post {
        val engine = tts ?: return@post
        if (status != TextToSpeech.SUCCESS) {
          // 다음 말할 때 다시 만든다
          engine.shutdown()
          tts = null
          pending.clear()
          return@post
        }
        val korean = Locale.KOREAN
        val available = engine.isLanguageAvailable(korean)
        if (available != TextToSpeech.LANG_MISSING_DATA && available != TextToSpeech.LANG_NOT_SUPPORTED) {
          engine.language = korean
        }
        engine.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        ready = true
        val waiting = pending.toList()
        pending.clear()
        for ((text, flush) in waiting) speakNow(text, flush)
      }
    }
  }

  private fun acquireWakeLock(app: Context, timeoutMs: Long) {
    val lock = wakeLock ?: (app.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, TAG)
      .apply { setReferenceCounted(false) }
      .also { wakeLock = it }
    // 시간 제한을 둬서 JS가 cancel을 못 불러도 풀리게 한다
    lock.acquire(timeoutMs.coerceAtLeast(STALE_MS))
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
  }
}
