# ProGuard rules for Molly Bridge
# Currently disabled (isMinifyEnabled = false) for debugging
# Enable when shipping to production

# Keep all Molly app classes
-keep class dev.molly.app.** { *; }
-keep interface dev.molly.app.** { *; }

# Keep OkHttp classes
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn javax.annotation.**

# Keep Kotlin coroutines
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# Keep Android lifecycle
-keep class androidx.lifecycle.** { *; }
-dontwarn androidx.lifecycle.**

# Generic Android/Support library rules
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes Exceptions

# Keep native methods
-keepclasseswithmembernames class * {
  native <methods>;
}

# Obfuscation settings (when enabled)
-optimizationpasses 5
-dontusemixedcaseclassnames
-verbose

# Logging
-dontnote java.io.**
-dontnote java.lang.**
-dontnote java.util.**
