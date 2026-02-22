from fastapi import FastAPI, UploadFile
from pydantic import BaseModel
import fitz  # PyMuPDF
import os
import uuid
import boto3
from typing import List

app = FastAPI()

s3 = boto3.client("s3")
BUCKET = os.getenv("AWS_TRAINING_BUCKET")

@app.get("/health")
async def health_check():
    return {"ok": True}

class DiagramInfo(BaseModel):
    diagram_id: str
    image_s3_url: str
    bbox: list

class PageInfo(BaseModel):
    page_number: int
    text_blocks: List[dict]
    diagrams: List[DiagramInfo]

class ExtractResponse(BaseModel):
    pages: List[PageInfo]


@app.post("/extract", response_model=ExtractResponse)
async def extract_pdf(file: UploadFile):

    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    pages = []

    for page_index in range(len(doc)):
        page = doc[page_index]
        text_blocks = []

        blocks = page.get_text("blocks")
        for b in blocks:
            text_blocks.append({
                "text": b[4],
                "bbox": b[:4]
            })

        diagrams = []
        images = page.get_images(full=True)

        for img in images:
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]

            diagram_id = str(uuid.uuid4())
            key = f"diagram-crops/{diagram_id}.png"

            s3.put_object(
                Bucket=BUCKET,
                Key=key,
                Body=image_bytes,
                ContentType="image/png"
            )

            diagrams.append({
                "diagram_id": diagram_id,
                "image_s3_url": f"s3://{BUCKET}/{key}",
                "bbox": []
            })

        pages.append({
            "page_number": page_index + 1,
            "text_blocks": text_blocks,
            "diagrams": diagrams
        })

    return {"pages": pages}