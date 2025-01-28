import Konva from 'konva';
import { BehaviorSubject, Observable } from 'rxjs';

type Orientation = 0 | 90 | 180 | 270;

export class CanvasEditor {
  private stage: Konva.Stage;

  // Pages (Konva.Layer) and each page's orientation
  private pages: Konva.Layer[] = [];
  private pageOrientations: Orientation[] = [];

  // Current page index
  private currentPageIndex: number = -1;

  // Base dimension for US Letter in portrait
  private baseWidth = 612;
  private baseHeight = 792;

  // Zoom factor
  private currentZoom = 1;

  // Rectangle drawing
  private isDrawing = false;
  private drawStartPos: { x: number; y: number } | null = null;
  private newRect: Konva.Rect | null = null;

  // Selection
  private selectedRect: Konva.Rect | null = null;

  // -------------------------------------------------------
  // RxJS Subjects for page index & page count
  // -------------------------------------------------------
  private currentPageIndexSubject = new BehaviorSubject<number>(-1);
  public currentPageIndex$: Observable<number> = this.currentPageIndexSubject.asObservable();

  private pageCountSubject = new BehaviorSubject<number>(0);
  public pageCount$: Observable<number> = this.pageCountSubject.asObservable();

  constructor(containerId: string) {
    this.stage = new Konva.Stage({
      container: containerId,
      width: this.baseWidth,
      height: this.baseHeight,
    });

    // Bind events for drawing & selection
    this.stage.on('mousedown', (e) => this.handleMouseDown(e));
    this.stage.on('mouseup', (e) => this.handleMouseUp(e));
    this.stage.on('mousemove', (e) => this.handleMouseMove(e));
  }

  // -------------------------------------------------------
  // Utility: Convert mouse pointer to local, unscaled coords
  // -------------------------------------------------------
  private getRelativePointerPosition(): { x: number; y: number } {
    const transform = this.stage.getAbsoluteTransform().copy();
    transform.invert();

    const pos = this.stage.getPointerPosition();
    if (!pos) {
      return { x: 0, y: 0 };
    }
    return transform.point(pos);
  }

  // -------------------------------------------------------
  // Page Management
  // -------------------------------------------------------
  public addPage(): void {
    // Hide current if there is one
    if (this.currentPageIndex >= 0) {
      this.pages[this.currentPageIndex].hide();
    }

    // Create new layer
    const layer = new Konva.Layer();
    this.stage.add(layer);

    this.pages.push(layer);
    this.pageOrientations.push(0); // Start new page in portrait (0°)
    this.currentPageIndex = this.pages.length - 1;

    // Notify RxJS subscribers
    this.currentPageIndexSubject.next(this.currentPageIndex);

    // Update page count
    this.pageCountSubject.next(this.pages.length);

    // Show the new page
    layer.show();
    layer.draw();
  }

  public nextPage(): void {
    if (this.currentPageIndex < this.pages.length - 1) {
      this.goToPage(this.currentPageIndex + 1);
    }
  }

  public prevPage(): void {
    if (this.currentPageIndex > 0) {
      this.goToPage(this.currentPageIndex - 1);
    }
  }

  public goToPage(pageIndex: number): void {
    if (pageIndex < 0 || pageIndex >= this.pages.length) {
      return;
    }
    // Hide current
    if (this.currentPageIndex >= 0) {
      this.pages[this.currentPageIndex].hide();
    }

    this.currentPageIndex = pageIndex;
    this.currentPageIndexSubject.next(this.currentPageIndex);

    // Show target page
    this.pages[this.currentPageIndex].show();
    this.pages[this.currentPageIndex].draw();

    // Re-apply orientation/zoom to stage
    this.applyPageOrientation(this.currentPageIndex);
  }

  // -------------------------------------------------------
  // Rotation (Approach #2)
  // -------------------------------------------------------
  public rotateLeft(): void {
    if (this.currentPageIndex < 0) return;

    const oldO = this.pageOrientations[this.currentPageIndex];
    const newO = this.rotateOrientationLeft(oldO);
    this.pageOrientations[this.currentPageIndex] = newO;

    // Re-map shapes from old->new orientation
    this.transformShapesBetweenOrientations(
      this.pages[this.currentPageIndex],
      oldO,
      newO
    );

    this.applyPageOrientation(this.currentPageIndex);
  }

  public rotateRight(): void {
    if (this.currentPageIndex < 0) return;

    const oldO = this.pageOrientations[this.currentPageIndex];
    const newO = this.rotateOrientationRight(oldO);
    this.pageOrientations[this.currentPageIndex] = newO;

    this.transformShapesBetweenOrientations(
      this.pages[this.currentPageIndex],
      oldO,
      newO
    );

    this.applyPageOrientation(this.currentPageIndex);
  }

  private rotateOrientationLeft(o: Orientation): Orientation {
    switch (o) {
      case 0:   return 270;
      case 90:  return 0;
      case 180: return 90;
      case 270: return 180;
    }
  }

  private rotateOrientationRight(o: Orientation): Orientation {
    switch (o) {
      case 0:   return 90;
      case 90:  return 180;
      case 180: return 270;
      case 270: return 0;
    }
  }

  // -------------------------------------------------------
  // Dimension & Orientation
  // -------------------------------------------------------
  private applyPageOrientation(pageIndex: number) {
    const orientation = this.pageOrientations[pageIndex];

    let pageW = this.baseWidth;
    let pageH = this.baseHeight;
    if (orientation === 90 || orientation === 270) {
      [pageW, pageH] = [this.baseHeight, this.baseWidth];
    }

    const scaledW = pageW * this.currentZoom;
    const scaledH = pageH * this.currentZoom;

    this.stage.width(scaledW);
    this.stage.height(scaledH);
    // We do NOT rotate the layer. Instead, shapes are re-mapped.
  }

  private transformShapesBetweenOrientations(
    layer: Konva.Layer,
    oldOrientation: Orientation,
    newOrientation: Orientation
  ): void {
    if (oldOrientation === newOrientation) return;

    // Old dimension
    let oldW = this.baseWidth;
    let oldH = this.baseHeight;
    if (oldOrientation === 90 || oldOrientation === 270) {
      [oldW, oldH] = [this.baseHeight, this.baseWidth];
    }

    // New dimension
    let newW = this.baseWidth;
    let newH = this.baseHeight;
    if (newOrientation === 90 || newOrientation === 270) {
      [newW, newH] = [this.baseHeight, this.baseWidth];
    }

    const angleDelta = this.getAngleDelta(oldOrientation, newOrientation);
    const rad = (Math.PI / 180) * angleDelta;

    const oldCenter = { x: oldW / 2, y: oldH / 2 };
    const newCenter = { x: newW / 2, y: newH / 2 };

    layer.getChildren().forEach((shape) => {
      const oldPos = shape.position();
      const dx = oldPos.x - oldCenter.x;
      const dy = oldPos.y - oldCenter.y;

      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      const newDx = dx * cosA - dy * sinA;
      const newDy = dx * sinA + dy * cosA;

      const finalX = newCenter.x + newDx;
      const finalY = newCenter.y + newDy;
      shape.position({ x: finalX, y: finalY });

      shape.rotation(shape.rotation() + angleDelta);
    });

    layer.batchDraw();
  }

  private getAngleDelta(oldO: Orientation, newO: Orientation): number {
    const numOld = oldO / 90;
    const numNew = newO / 90;

    let diff = (numNew - numOld) * 90;
    if (diff > 180)  diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
  }

  // -------------------------------------------------------
  // Zoom
  // -------------------------------------------------------
  public zoom(factor: number): void {
    if (factor <= 0) return;
    this.currentZoom = factor;
    this.stage.scale({ x: factor, y: factor });

    if (this.currentPageIndex >= 0) {
      this.applyPageOrientation(this.currentPageIndex);
    }
  }

  public zoomIn(): void {
    this.zoom(this.currentZoom + 0.1);
  }

  public zoomOut(): void {
    const newZoom = this.currentZoom - 0.1;
    if (newZoom > 0) {
      this.zoom(newZoom);
    }
  }

  public resetZoom(): void {
    this.zoom(1);
  }

  public resetStageSize(): void {
    this.resetZoom();
  }

  // -------------------------------------------------------
  // Add Non-Draggable Image
  // -------------------------------------------------------
  public addImg(objUrl: string): void {
    if (this.currentPageIndex < 0) {
      this.addPage();
    }

    const layer = this.pages[this.currentPageIndex];
    const orientation = this.pageOrientations[this.currentPageIndex];

    const imageObj = new Image();
    imageObj.src = objUrl;
    imageObj.onload = () => {
      const imgWidth = imageObj.width;
      const imgHeight = imageObj.height;

      let w = this.baseWidth;
      let h = this.baseHeight;
      if (orientation === 90 || orientation === 270) {
        [w, h] = [this.baseHeight, this.baseWidth];
      }

      // Fit
      const scaleFactor = Math.min(w / imgWidth, h / imgHeight);

      const konvaImg = new Konva.Image({
        image: imageObj,
        x: (w - imgWidth * scaleFactor) / 2,
        y: (h - imgHeight * scaleFactor) / 2,
        width: imgWidth * scaleFactor,
        height: imgHeight * scaleFactor,
        draggable: false,
      });

      layer.add(konvaImg);
      layer.draw();
    };
  }

  // -------------------------------------------------------
  // Draw Rectangle
  // -------------------------------------------------------
  public addRectangle(): void {
    this.isDrawing = true;
  }

  public deleteRectangle(): void {
    if (this.selectedRect) {
      this.selectedRect.destroy();
      this.selectedRect = null;
      if (this.currentPageIndex >= 0) {
        this.pages[this.currentPageIndex].draw();
      }
    }
  }

  // -------------------------------------------------------
  // Mouse Events (rectangle drawing + selection)
  // -------------------------------------------------------
  private handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (this.isDrawing && this.currentPageIndex >= 0) {
      const localPos = this.getRelativePointerPosition();

      this.drawStartPos = { x: localPos.x, y: localPos.y };
      this.newRect = new Konva.Rect({
        x: localPos.x,
        y: localPos.y,
        width: 0,
        height: 0,
        fill: 'rgba(0, 0, 255, 0.2)',
        stroke: 'blue',
        strokeWidth: 1,
        draggable: true, // rectangles remain draggable
      });
      this.pages[this.currentPageIndex].add(this.newRect);

    } else {
      // Not drawing => selection
      this.handleSelection(e);
    }
  }

  private handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (this.isDrawing && this.drawStartPos && this.newRect) {
      const localPos = this.getRelativePointerPosition();

      const width = localPos.x - this.drawStartPos.x;
      const height = localPos.y - this.drawStartPos.y;

      this.newRect.x(Math.min(this.drawStartPos.x, localPos.x));
      this.newRect.y(Math.min(this.drawStartPos.y, localPos.y));
      this.newRect.width(Math.abs(width));
      this.newRect.height(Math.abs(height));

      this.pages[this.currentPageIndex].draw();
    }
  }

  private handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.drawStartPos = null;
      this.newRect = null;
    }
  }

  // -------------------------------------------------------
  // Rectangle Selection
  // -------------------------------------------------------
  private handleSelection(e: Konva.KonvaEventObject<MouseEvent>): void {
    const clickedShape = e.target;
    if (clickedShape && clickedShape instanceof Konva.Rect) {
      if (this.selectedRect === clickedShape) {
        // Deselect if clicked again
        this.deselectRectangle();
      } else {
        this.selectRectangle(clickedShape);
      }
    } else {
      // Non-rect => deselect
      this.deselectRectangle();
    }
  }

  private selectRectangle(rect: Konva.Rect): void {
    if (this.selectedRect) {
      this.selectedRect.stroke('blue');
    }
    this.selectedRect = rect;
    this.selectedRect.stroke('red');

    if (this.currentPageIndex >= 0) {
      this.pages[this.currentPageIndex].draw();
    }
  }

  private deselectRectangle(): void {
    if (this.selectedRect) {
      this.selectedRect.stroke('blue');
      this.selectedRect = null;
      if (this.currentPageIndex >= 0) {
        this.pages[this.currentPageIndex].draw();
      }
    }
  }

  // -------------------------------------------------------
  // toPngs(longEdge): Return an array of PNG data URLs
  // with the specified "long dimension" for each exported image,
  // using `pixelRatio` to ensure the content fills the final image.
  // -------------------------------------------------------
  public async toPngs(longEdge: number): Promise<string[]> {
    if (longEdge <= 0) {
      throw new Error("longEdge must be a positive number.");
    }

    const pngs: string[] = [];

    for (let i = 0; i < this.pages.length; i++) {
      this.goToPage(i);

      // Wait a frame so Konva can render the page
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const stageW = this.stage.width();
      const stageH = this.stage.height();

      // Compute how to scale so that the "long dimension" = longEdge
      let ratio: number;
      if (stageW >= stageH) {
        // stage is landscape or square
        ratio = longEdge / stageW;
      } else {
        // stage is portrait
        ratio = longEdge / stageH;
      }

      // Export the entire stage area, scaled by `pixelRatio = ratio`
      const dataUrl = this.stage.toDataURL({
        mimeType: 'image/png',
        x: 0,
        y: 0,
        width: stageW,    // in local coords
        height: stageH,   // in local coords
        pixelRatio: ratio // scale up so the "long edge" is `longEdge`
      });

      pngs.push(dataUrl);
    }

    return pngs;
  }
}
