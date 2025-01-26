import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CanvasEditor } from './canvas-editor';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { map, Observable, of } from 'rxjs';
import { CommonModule } from '@angular/common';

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
        const objUrl = URL.createObjectURL(file);
        console.log(file.name, objUrl);
        this.canvasEditor.addPage();
        await this.canvasEditor.addImage(objUrl);
      }

      this.canvasEditor.showPage(0);
    }
  }

  onNextPageClicked() {
    this.canvasEditor.showNextPage();
  }

  onPreviousPageClicked() {
    this.canvasEditor.showPreviousPage();
  }

  rotateLeft() {
    this.canvasEditor.rotateLeft();
  }

  rotateRight() {
    this.canvasEditor.rotateRight();
  }

  onDrawRedactionClicked() {
    console.log('Draw redaction clicked');
    this.canvasEditor.drawRectangle();
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
    this.canvasEditor = new CanvasEditor(divElem);
    this.currentPage$ = this.canvasEditor.pageIndex$.pipe(map((index) => index + 1));
    this.pageCount$ = this.canvasEditor.pageCount$;
  }

  onDeleteRedactionClicked() {
    this.canvasEditor.deleteSelectedRedaction();
  }
}
