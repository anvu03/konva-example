import Konva from 'konva';
import { BehaviorSubject, Observable } from 'rxjs';

type Orientation = 0 | 90 | 180 | 270;

export class CanvasEditor {
  private stage: Konva.Stage;

  // Pages (Konva.Layer), each with an orientation.
  private pages: Konva.Layer[] = [];
  private pageOrientations: Orientation[] = [];

  // Current page index (zero-based)
  private currentPageIndex: number = -1;

  // US Letter size in portrait
  private baseWidth = 612;
  private baseHeight = 792;

  // Zoom factor
  private currentZoom = 1;

  // State for rectangle drawing
  private isDrawing = false;
  private drawStartPos: { x: number; y: number } | null = null;
  private newRect: Konva.Rect | null = null;

  // State for rectangle selection
  private selectedRect: Konva.Rect | null = null;

  // -------------------------------------------------------
  // 1) currentPageIndex$: For tracking which page is active
  // -------------------------------------------------------
  private currentPageIndexSubject = new BehaviorSubject<number>(-1);
  public currentPageIndex$: Observable<number> = this.currentPageIndexSubject.asObservable();

  // -------------------------------------------------------
  // 2) pageCount$: For tracking total number of pages
  // -------------------------------------------------------
  private pageCountSubject = new BehaviorSubject<number>(0);
  public pageCount$: Observable<number> = this.pageCountSubject.asObservable();

  constructor(containerId: string) {
    this.stage = new Konva.Stage({
      container: containerId,
      width: this.baseWidth,
      height: this.baseHeight,
    });

    // Bind the drawing + selection events
    this.stage.on('mousedown', (e) => this.handleMouseDown(e));
    this.stage.on('mouseup', (e) => this.handleMouseUp(e));
    this.stage.on('mousemove', (e) => this.handleMouseMove(e));
  }

  // ------------------------------------------------------------------
  // Helper to convert the raw mouse pointer coords into the stage's
  // LOCAL coordinate system, accounting for zoom/scale/rotation, etc.
  // This fixes the rectangle-drawing bug at different zoom levels.
  // ------------------------------------------------------------------
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
    // Hide current page if any
    if (this.currentPageIndex >= 0) {
      this.pages[this.currentPageIndex].hide();
    }

    // Create new layer, store it
    const layer = new Konva.Layer();
    this.stage.add(layer);

    this.pages.push(layer);
    this.pageOrientations.push(0); // new page => portrait (0°)
    this.currentPageIndex = this.pages.length - 1;
    this.currentPageIndexSubject.next(this.currentPageIndex);

    // Update pageCount$ as we added a page
    this.pageCountSubject.next(this.pages.length);

    // Show/draw new page
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
    if (pageIndex < 0 || pageIndex >= this.pages.length) return;

    // Hide current page
    if (this.currentPageIndex >= 0) {
      this.pages[this.currentPageIndex].hide();
    }

    // Switch to target
    this.currentPageIndex = pageIndex;
    this.currentPageIndexSubject.next(this.currentPageIndex);

    this.pages[this.currentPageIndex].show();
    this.pages[this.currentPageIndex].draw();

    // Update stage dimension for that page orientation
    this.applyPageOrientation(this.currentPageIndex);
  }

  // -------------------------------------------------------
  // Rotation (Approach #2: physically swap dimension + re-map shapes)
  // -------------------------------------------------------
  public rotateLeft(): void {
    if (this.currentPageIndex < 0) return;

    const oldOrientation = this.pageOrientations[this.currentPageIndex];
    const newOrientation = this.rotateOrientationLeft(oldOrientation);
    this.pageOrientations[this.currentPageIndex] = newOrientation;

    // Re-map all shapes from old->new orientation
    this.transformShapesBetweenOrientations(
      this.pages[this.currentPageIndex],
      oldOrientation,
      newOrientation
    );

    // Re-apply dimension changes
    this.applyPageOrientation(this.currentPageIndex);
  }

  public rotateRight(): void {
    if (this.currentPageIndex < 0) return;

    const oldOrientation = this.pageOrientations[this.currentPageIndex];
    const newOrientation = this.rotateOrientationRight(oldOrientation);
    this.pageOrientations[this.currentPageIndex] = newOrientation;

    this.transformShapesBetweenOrientations(
      this.pages[this.currentPageIndex],
      oldOrientation,
      newOrientation
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

  // ----------------------------------------------------------------
  // applyPageOrientation => set the stage dimension according to
  // the page's orientation (portrait vs. landscape) + current zoom
  // ----------------------------------------------------------------
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

    // We do NOT rotate the layer: shapes are re-mapped instead.
  }

  // ----------------------------------------------------------------
  // transformShapesBetweenOrientations => "bake in" the rotation by
  // adjusting each shape's (x,y) + rotation so it appears in the same
  // place in the new orientation
  // ----------------------------------------------------------------
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

    // angleDelta = how many degrees from old->new
    const angleDelta = this.getAngleDelta(oldOrientation, newOrientation);
    const rad = (Math.PI / 180) * angleDelta;

    const oldCenter = { x: oldW / 2, y: oldH / 2 };
    const newCenter = { x: newW / 2, y: newH / 2 };

    layer.getChildren().forEach((shape) => {
      // 1) old position relative to oldCenter
      const oldPos = shape.position();
      const dx = oldPos.x - oldCenter.x;
      const dy = oldPos.y - oldCenter.y;

      // standard rotation around origin
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const newDx = dx * cosA - dy * sinA;
      const newDy = dx * sinA + dy * cosA;

      // 2) shift so it's around newCenter
      const finalX = newCenter.x + newDx;
      const finalY = newCenter.y + newDy;
      shape.position({ x: finalX, y: finalY });

      // 3) rotate shape's own angle
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

    // Stage scaling
    this.stage.scale({ x: factor, y: factor });

    // Re-apply orientation => stage dimension
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
  // Add Image (Non-Draggable)
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

      // For orientation, figure out the "unrotated" page dimension
      let w = this.baseWidth;
      let h = this.baseHeight;
      if (orientation === 90 || orientation === 270) {
        [w, h] = [this.baseHeight, this.baseWidth];
      }

      // Fit the image
      const scaleFactor = Math.min(w / imgWidth, h / imgHeight);

      const konvaImg = new Konva.Image({
        image: imageObj,
        x: (w - imgWidth * scaleFactor) / 2,
        y: (h - imgHeight * scaleFactor) / 2,
        width: imgWidth * scaleFactor,
        height: imgHeight * scaleFactor,
        draggable: false, // Images are not draggable
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
  // MOUSE EVENTS: use getRelativePointerPosition() for correct coords
  // -------------------------------------------------------
  private handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (this.isDrawing && this.currentPageIndex >= 0) {
      // 1) local pointer pos => unscaled coords
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
      // Not drawing => selection logic
      this.handleSelection(e);
    }
  }

  private handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (this.isDrawing && this.drawStartPos && this.newRect) {
      // 2) Get local pointer pos again
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
  // Selection: click on a rect -> select it; click again -> deselect
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
      // Clicked on stage or non-rect => deselect
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
}
