from ..base import SmsProvider, SmsSendRequest, SmsSendResult
from ..config import SmsSettings
from ..exceptions import SmsProviderError
from ...constants import SmsProviderEnum


class DialogESmsProvider(SmsProvider):
    provider_name = SmsProviderEnum.DIALOG_ESMS

    def __init__(self, settings: SmsSettings) -> None:
        super().__init__(settings)
        settings.require("dialog_esms_base_url")

    def send(self, request: SmsSendRequest) -> SmsSendResult:
        raise SmsProviderError(
            "Dialog e-SMS adapter is registered but the provider-specific payload mapping "
            "has not been finalized yet."
        )
