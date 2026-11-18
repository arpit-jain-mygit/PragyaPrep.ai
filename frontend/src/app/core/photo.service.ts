import { Injectable } from '@angular/core';
import { ApiError } from './models';
import { Crop, MAX_PHOTO_BYTES, PHOTO_SIZE, centerCrop } from './avatar';

export interface LoadedPicture {
  image: HTMLImageElement;
  /** A link to show the picture while it is being cropped. Call release() when done. */
  url: string;
  width: number;
  height: number;
  release(): void;
}

/** Reads a picture the person chose and cuts it to a small square JPEG. Kept in a service so tests can stand in for the canvas. */
@Injectable({ providedIn: 'root' })
export class PhotoService {
  load(file: Blob): Promise<LoadedPicture> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ image, url, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject({ status: 0, detail: "That file couldn't be read as a picture. Choose a JPG, PNG or WebP." } as ApiError);
      };
      image.src = url;
    });
  }

  /** Draw the chosen square into a 256 by 256 JPEG, lowering the quality a little if it is still too big. */
  async render(picture: LoadedPicture, crop: Crop): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PHOTO_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw { status: 0, detail: "This browser can't prepare the photo." } as ApiError;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    context.drawImage(picture.image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
    }
    throw { status: 0, detail: 'That picture could not be made small enough.' } as ApiError;
  }

  /** For many photos at once: the middle square of each, made small. */
  async centerSquare(file: Blob): Promise<Blob> {
    const picture = await this.load(file);
    try {
      return await this.render(picture, centerCrop(picture.width, picture.height));
    } finally {
      picture.release();
    }
  }

  /** A screenshot to send: kept as it is if small, else scaled down (longest side 1600) to a JPEG, then written as base64 text. */
  async screenshotText(file: Blob): Promise<string> {
    let blob = file;
    if (file.size > 800 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      const picture = await this.load(file);
      try {
        const scale = Math.min(1, 1600 / Math.max(picture.width, picture.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(picture.width * scale);
        canvas.height = Math.round(picture.height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw { status: 0, detail: "This browser can't prepare the screenshot." } as ApiError;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(picture.image, 0, 0, canvas.width, canvas.height);
        const made = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!made) throw { status: 0, detail: 'That screenshot could not be made small enough.' } as ApiError;
        blob = made;
      } finally {
        picture.release();
      }
    }
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
      reader.onerror = () => reject({ status: 0, detail: "That screenshot couldn't be read." } as ApiError);
      reader.readAsDataURL(blob);
    });
  }
}
