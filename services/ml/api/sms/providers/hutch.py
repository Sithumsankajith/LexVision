from ..base import SmsProvider, SmsSendRequest, SmsSendResult
from ..config import SmsSettings
from ..exceptions import SmsProviderError
from ...constants import SmsProviderEnum


class HutchSmsProvider(SmsProvider):
    provider_name = SmsProviderEnum.HUTCH

    def __init__(self, settings: SmsSettings) -> None:
        super().__init__(settings)
        settings.require("hutch_sms_base_url")

    def send(self, request: SmsSendRequest) -> SmsSendResult:
        raise SmsProviderError(
            "HUTCH SMS adapter is registered but the provider-specific payload mapping "
            "has not been finalized yet."
        )
