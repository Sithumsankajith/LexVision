const SRI_LANKAN_MOBILE_SIGNIFICANT_NUMBER = /^7\d{8}$/;

const INVALID_PHONE_MESSAGE = 'Enter a valid Sri Lankan mobile number.';

const stripToDigits = (value: string): string => value.replace(/\D/g, '');

export const normalizeSriLankanPhone = (input: string): string => {
    const digits = stripToDigits(input);

    if (!digits) {
        throw new Error(INVALID_PHONE_MESSAGE);
    }

    let subscriberDigits = '';

    if (digits.length === 10 && digits.startsWith('0')) {
        subscriberDigits = digits.slice(1);
    } else if (digits.length === 11 && digits.startsWith('94')) {
        subscriberDigits = digits.slice(2);
    } else if (digits.length === 9 && digits.startsWith('7')) {
        subscriberDigits = digits;
    }

    if (!SRI_LANKAN_MOBILE_SIGNIFICANT_NUMBER.test(subscriberDigits)) {
        throw new Error(INVALID_PHONE_MESSAGE);
    }

    return `+94${subscriberDigits}`;
};

export const isNormalizedSriLankanPhone = (input: string): boolean => {
    try {
        return normalizeSriLankanPhone(input) === input;
    } catch {
        return false;
    }
};
