import { Injectable } from '@angular/core';
import { ApiError, UploadForm } from './models';

/**
 * Sends a file straight to S3 with the signed form the API gave. It uses XMLHttpRequest because
 * it can report progress while the file goes up, which fetch can't. Our own sign-in is not sent here.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  send(form: UploadForm, file: File, onProgress: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const data = new FormData();
      for (const [name, value] of Object.entries(form.fields)) data.append(name, value);
      data.append('file', file); // S3 needs the file to be the last field

      const request = new XMLHttpRequest();
      request.open('POST', form.url);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) resolve();
        else reject(failure(request.status === 403 ? 'The upload was refused. Please try again.' : 'The upload failed. Please try again.', request.status));
      };
      request.onerror = () => reject(failure("The upload couldn't reach the storage service. Check your connection and try again.", 0));
      request.send(data);
    });
  }
}

function failure(detail: string, status: number): ApiError {
  return { status, detail };
}
