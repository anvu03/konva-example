import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CanvasEditor } from './canvas-editor';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { map, Observable, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { PdfToPngService } from './pdf-to-png';

@Component({
  selector: 'app-home',
  imports: [ButtonModule, DialogModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.Default,
  standalone: true,
})
export class HomeComponent {
  private canvasEditor!: CanvasEditor;
  currentPage$: Observable<number> = of(0);
  pageCount$: Observable<number> = of(0);

  constructor(readonly pdfToPngService: PdfToPngService) {}

  ngOnInit(): void {}

  onUpload($event: MouseEvent) {
    const inputElem = document.getElementById('file-input') as HTMLInputElement;
    inputElem.click();
  }

  async onFileChange($event: Event) {
    const target = $event.target as HTMLInputElement;
    if (target.files) {
      const files = Array.from(target.files);
      console.log(files);

      // Handle file upload
      for (const file of files) {
        if (file.type === 'application/pdf') {
          const pngs = await this.pdfToPngService.convertPdfToPng(file, 3);
          for (let i = 0; i < pngs.length; i++) {
            const png = pngs[i];
            const objUrl = URL.createObjectURL(png);
            console.log(file.name, objUrl);
            this.canvasEditor.addPage();
            await this.canvasEditor.addImg(objUrl);
          }
        } else if (file.type.startsWith('image/')) {
          const objUrl = URL.createObjectURL(file);
          console.log(file.name, objUrl);
          this.canvasEditor.addPage();
          await this.canvasEditor.addImg(objUrl);
        }
      }

      this.canvasEditor.goToPage(0);
    }
  }

  onNextPageClicked() {
    this.canvasEditor.nextPage();
  }

  onPreviousPageClicked() {
    this.canvasEditor.prevPage();
  }

  rotateLeft() {
    this.canvasEditor.rotateLeft();
  }

  rotateRight() {
    this.canvasEditor.rotateRight();
  }

  onDrawRedactionClicked() {
    console.log('Draw redaction clicked');
    this.canvasEditor.addRectangle();
  }

  onZoomInClicked() {
    this.canvasEditor.zoomIn();
  }

  onZoomOutClicked() {
    this.canvasEditor.zoomOut();
  }

  onResetZoomClicked() {
    this.canvasEditor.resetZoom();
  }

  onDialogShow() {
    const divElem = document.getElementById(
      'canvas-container'
    ) as HTMLDivElement;
    this.canvasEditor = new CanvasEditor('canvas-container');
    this.currentPage$ = this.canvasEditor.currentPageIndex$.pipe(map((index) => index + 1));
    this.pageCount$ = this.canvasEditor.pageCount$;
  }

  onDeleteRedactionClicked() {
    this.canvasEditor.deleteRectangle();
  }

  async onSaveClicked() {
    const pngs = await this.canvasEditor.toPngs(5000);

    for (let i = 0; i < pngs.length; i++) {
      const png = pngs[i];
      const a = document.createElement('a');
      a.href = png;
      a.download = `page-${i + 1}.png`;
      a.click();
    }
  }
}
