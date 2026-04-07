from ..base import SmsProvider, SmsSendRequest, SmsSendResult
from ..config import SmsSettings
from ..exceptions import SmsProviderError
from ...constants import SmsProviderEnum


class MobitelMSmsProvider(SmsProvider):
    provider_name = SmsProviderEnum.MOBITEL_MSMS

    def __init__(self, settings: SmsSettings) -> None:
        super().__init__(settings)
        settings.require("mobitel_msms_base_url")

    def send(self, request: SmsSendRequest) -> SmsSendResult:
        raise SmsProviderError(
            "Mobitel mSMS adapter is registered but the provider-specific payload mapping "
            "has not been finalized yet."
        )
