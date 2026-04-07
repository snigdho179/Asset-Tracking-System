from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_M


def save_qr_image(payload: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)

    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")
    image.save(destination)
