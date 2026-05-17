import base64
import binascii
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class DecryptionError(Exception):
    """Raised when encrypted payload cannot be safely decrypted."""


def _derive_key(master_key: str) -> bytes:
    return hashlib.sha256(master_key.encode("utf-8")).digest()


def encrypt_identifier(original_id: str, master_key: str) -> tuple[str, str, str]:
    key = _derive_key(master_key)
    nonce = os.urandom(12)

    aesgcm = AESGCM(key)
    encrypted_bytes = aesgcm.encrypt(nonce, original_id.encode("utf-8"), None)

    return (
        base64.b64encode(encrypted_bytes).decode("utf-8"),
        base64.b64encode(key).decode("utf-8"),
        base64.b64encode(nonce).decode("utf-8"),
    )


def decrypt_identifier(
    encrypted_blob_b64: str,
    nonce_b64: str,
    key_b64: str | None = None,
    private_key: str | None = None,
) -> str:
    """Decrypt an AES-256-GCM encrypted asset identifier.

    Provide either ``key_b64`` (raw base64-encoded key bytes) **or**
    ``private_key`` (plaintext master key that will be SHA-256-derived).
    When ``private_key`` is supplied it takes precedence.
    """
    if private_key is not None:
        key = _derive_key(private_key)
    elif key_b64 is not None:
        try:
            key = base64.b64decode(key_b64)
        except (binascii.Error, ValueError) as exc:
            raise DecryptionError("Malformed base64 key.") from exc
    else:
        raise DecryptionError("Either key_b64 or private_key must be supplied.")

    try:
        encrypted_bytes = base64.b64decode(encrypted_blob_b64)
        nonce = base64.b64decode(nonce_b64)
    except (binascii.Error, ValueError) as exc:
        raise DecryptionError("Malformed base64 payload.") from exc

    try:
        aesgcm = AESGCM(key)
        decrypted_bytes = aesgcm.decrypt(nonce, encrypted_bytes, None)
    except (InvalidTag, ValueError) as exc:
        raise DecryptionError("Integrity check failed — key is incorrect or data is tampered.") from exc

    return decrypted_bytes.decode("utf-8")

