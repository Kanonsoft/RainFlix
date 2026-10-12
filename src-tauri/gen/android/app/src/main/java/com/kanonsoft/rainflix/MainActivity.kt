package com.kanonsoft.rainflix

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.content.pm.ActivityInfo
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView

class MainActivity : TauriActivity() {
  private fun browser(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) for (index in 0 until view.childCount) browser(view.getChildAt(index))?.let { return it }
    return null
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      private var pending = false
      private fun exitPage() {
        isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        isEnabled = true
      }
      override fun handleOnBackPressed() {
        if (pending) return
        val webView = browser(findViewById(android.R.id.content))
        if (webView == null) { exitPage(); return }
        pending = true
        webView.evaluateJavascript("typeof window.rainflixNavigateBack === 'function' && window.rainflixNavigateBack()") { handled ->
          pending = false
          if (handled != "true") exitPage()
        }
      }
    })
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
    ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
