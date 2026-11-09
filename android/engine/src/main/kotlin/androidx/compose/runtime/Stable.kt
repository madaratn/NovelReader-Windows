package androidx.compose.runtime

// The Aniyomi API marks filter lists @Stable for Compose; the app has no Compose.
@MustBeDocumented
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION, AnnotationTarget.PROPERTY_GETTER, AnnotationTarget.PROPERTY)
@Retention(AnnotationRetention.BINARY)
annotation class Stable
