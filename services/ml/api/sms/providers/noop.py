from ..base import SmsProvider, SmsSendRequest, SmsSendResult
from ..exceptions import SmsProviderError
from ...constants import SmsProviderEnum


class NoopSmsProvider(SmsProvider):
    provider_name = SmsProviderEnum.NOOP

    def send(self, request: SmsSendRequest) -> SmsSendResult:
        raise SmsProviderError("SMS_PROVIDER is set to noop; no external SMS provider was contacted.")
