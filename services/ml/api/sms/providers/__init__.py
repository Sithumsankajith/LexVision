from ..base import SmsProvider
from ..config import SmsSettings
from ..exceptions import SmsConfigurationError
from ...constants import SmsProviderEnum
from .dialog_esms import DialogESmsProvider
from .hutch import HutchSmsProvider
from .mobitel_msms import MobitelMSmsProvider
from .noop import NoopSmsProvider
from .twilio import TwilioSmsProvider


PROVIDER_REGISTRY: dict[SmsProviderEnum, type[SmsProvider]] = {
    SmsProviderEnum.NOOP: NoopSmsProvider,
    SmsProviderEnum.MOBITEL_MSMS: MobitelMSmsProvider,
    SmsProviderEnum.DIALOG_ESMS: DialogESmsProvider,
    SmsProviderEnum.HUTCH: HutchSmsProvider,
    SmsProviderEnum.TWILIO: TwilioSmsProvider,
}


def build_sms_provider(settings: SmsSettings) -> SmsProvider:
    provider_class = PROVIDER_REGISTRY.get(settings.provider)
    if provider_class is None:
        raise SmsConfigurationError(f"No SMS adapter registered for provider '{settings.provider.value}'.")
    return provider_class(settings)
