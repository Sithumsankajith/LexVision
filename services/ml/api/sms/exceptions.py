class SmsError(RuntimeError):
    """Base class for SMS integration errors."""


class SmsConfigurationError(SmsError):
    """Raised when the selected SMS provider is missing required configuration."""


class SmsProviderError(SmsError):
    """Raised when an SMS provider request fails."""
