pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }

  plugins {
    kotlin("android") version "1.9.22"
    id("com.android.application") version "8.3.0"
    id("com.android.library") version "8.3.0"
    id("org.jetbrains.kotlin.android") version "1.9.22"
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "MollyBridge"
include(":app")
