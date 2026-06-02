// Root build.gradle.kts for MollyBridge
// Defines shared build configuration and versions for all subprojects

plugins {
  id("com.android.application") version "8.3.0" apply false
  id("com.android.library") version "8.3.0" apply false
  kotlin("android") version "1.9.22" apply false
  kotlin("jvm") version "1.9.22" apply false
}

// Centralized version management
extra["compileSdkVersion"] = 34
extra["minSdkVersion"] = 26
extra["targetSdkVersion"] = 34
extra["versionCode"] = 1
extra["versionName"] = "0.1.0-bridge"

// Dependency versions
extra["kotlinVersion"] = "1.9.22"
extra["androidxCoreVersion"] = "1.13.1"
extra["androidxAppCompatVersion"] = "1.7.0"
extra["androidxLifecycleVersion"] = "2.8.4"
extra["materialVersion"] = "1.12.0"
extra["okhttpVersion"] = "4.12.0"
extra["kotlinCoroutinesVersion"] = "1.8.1"
extra["junitVersion"] = "4.13.2"
extra["androidxTestVersion"] = "1.6.1"

tasks.register("clean", Delete::class) {
  delete(rootProject.buildDir)
}
