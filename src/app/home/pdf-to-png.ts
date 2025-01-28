import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';

import "pdfjs-dist/build/pdf.worker.mjs";

@Injectable({
  providedIn: 'root',
})
export class PdfToPngService {
  constructor() {
    // Set the worker source to use the correct local path
    // pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.js';
  }

  /**
   * Converts a PDF file into an array of PNG blobs, one per page.
   * @param file PDF file to convert.
   * @param scale Scaling factor for rendering (default is 1.0).
   * @returns Promise that resolves to an array of PNG blobs.
   */
  async convertPdfToPng(file: File, scale: number = 1.0): Promise<Blob[]> {
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    const numPages = pdf.numPages;
    const pngBlobs: Blob[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale }); // Use user-specified scale

      // Create a canvas element
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render the page onto the canvas
      await page.render({ canvasContext: context, viewport }).promise;

      // Convert the canvas to a Blob (PNG format)
      const pngBlob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((blob) => resolve(blob!), 'image/png')
      );

      pngBlobs.push(pngBlob);
    }

    return pngBlobs;
  }
}
