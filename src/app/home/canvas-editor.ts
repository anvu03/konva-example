import Konva from 'konva';

type Orientation = 0 | 90 | 180 | 270;

export class CanvasEditor {
  private stage: Konva.Stage;
  private pages: Konva.Layer[] = [];
  private currentPageIndex: number = -1;

  // Each page has its own orientation
  private pageOrientations: Orientation[] = [];

  // "Base" dimension for US Letter in PORTRAIT
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

  constructor(containerId: string) {
    this.stage = new Konva.Stage({
      container: containerId,
      width: this.baseWidth,
      height: this.baseHeight,
    });

    // Bind drawing/selection events
    this.stage.on('mousedown', (e) => this.handleMouseDown(e));
    this.stage.on('mouseup', (e) => this.handleMouseUp(e));
    this.stage.on('mousemove', (e) => this.handleMouseMove(e));
  }

  /**
   * Create a new page with orientation=0 (portrait).
   */
  public addPage(): void {
    if (this.currentPageIndex >= 0) {
      this.pages[this.currentPageIndex].hide();
    }

    const layer = new Konva.Layer();
    this.stage.add(layer);

    this.pages.push(layer);
    this.pageOrientations.push(0); // start new page in portrait
    this.currentPageIndex = this.pages.length - 1;

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

    // Hide current
    if (this.currentPageIndex >= 0) {
      this.pages[this.currentPageIndex].hide();
    }

    // Show target
    this.currentPageIndex = pageIndex;
    this.pages[this.currentPageIndex].show();
    this.pages[this.currentPageIndex].draw();

    // Physically update the stage dimension to the new orientation's dimension
    this.applyPageOrientation(this.currentPageIndex);
  }

  // -----------------------------------------------------
  // Rotate Left/Right - Approach #2 with coordinate remap
  // -----------------------------------------------------

  public rotateLeft(): void {
    if (this.currentPageIndex < 0) return;

    // old orientation
    const oldOrientation = this.pageOrientations[this.currentPageIndex];
    // new orientation
    const newOrientation = this.rotateOrientationLeft(oldOrientation);
    this.pageOrientations[this.currentPageIndex] = newOrientation;

    // Re-map all shapes in this page from oldOrientation -> newOrientation
    this.transformShapesBetweenOrientations(
      this.pages[this.currentPageIndex],
      oldOrientation,
      newOrientation
    );

    // Now re-apply dimension changes
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

  /**
   * Apply page orientation => set stage dimension (width, height) according to orientation & zoom.
   * No actual shape rotation here, because we've already "baked" it into each shape's coords.
   */
  private applyPageOrientation(pageIndex: number) {
    const orientation = this.pageOrientations[pageIndex];

    // Figure out if we want 612×792 or 792×612
    let pageW = this.baseWidth;
    let pageH = this.baseHeight;
    if (orientation === 90 || orientation === 270) {
      [pageW, pageH] = [this.baseHeight, this.baseWidth];
    }

    // Scale by zoom
    const scaledW = pageW * this.currentZoom;
    const scaledH = pageH * this.currentZoom;

    // Update the stage
    this.stage.width(scaledW);
    this.stage.height(scaledH);

    // Optional: we do NOT rotate the layer.
    // The shapes have been physically moved/rotated in transformShapesBetweenOrientations().
  }

  /**
   * This is the core of "Approach #2."
   * For each shape in the layer, transform (x, y) from the old orientation's coordinate system
   * to the new orientation's coordinate system, rotating around the page center,
   * and also rotate the shape's own angle.
   *
   * If you want the shape's bounding box to remain axis-aligned, you'd also do width<->height swap
   * for rectangles. Typically, letting Konva rotate the shape visually is enough.
   */
  private transformShapesBetweenOrientations(
    layer: Konva.Layer,
    oldOrientation: Orientation,
    newOrientation: Orientation
  ): void {
    if (oldOrientation === newOrientation) return;

    // Compute old dimension
    let oldW = this.baseWidth;
    let oldH = this.baseHeight;
    if (oldOrientation === 90 || oldOrientation === 270) {
      [oldW, oldH] = [this.baseHeight, this.baseWidth];
    }

    // Compute new dimension
    let newW = this.baseWidth;
    let newH = this.baseHeight;
    if (newOrientation === 90 || newOrientation === 270) {
      [newW, newH] = [this.baseHeight, this.baseWidth];
    }

    // The rotation in degrees we are applying
    const angleDelta = this.getAngleDelta(oldOrientation, newOrientation);
    // Convert to radians
    const rad = (Math.PI / 180) * angleDelta;

    const oldCenter = { x: oldW / 2, y: oldH / 2 };
    const newCenter = { x: newW / 2, y: newH / 2 };

    layer.getChildren().forEach((shape) => {
      // 1) Rotate shape's position about the OLD center
      const oldPos = shape.position();
      const dx = oldPos.x - oldCenter.x;
      const dy = oldPos.y - oldCenter.y;

      // Standard 2D rotation around origin
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const newDx = dx * cosA - dy * sinA;
      const newDy = dx * sinA + dy * cosA;

      // 2) Shift so it's centered around the NEW center
      const finalX = newCenter.x + newDx;
      const finalY = newCenter.y + newDy;

      shape.position({ x: finalX, y: finalY });

      // 3) Rotate the shape's own angle so it visually turns too
      // (If you prefer the shape "stays upright," omit this line.)
      shape.rotation(shape.rotation() + angleDelta);

      // (Optional) If you want axis-aligned bounding boxes after rotation:
      //   - If shape is a Konva.Rect, you might swap width/height on +90/-90.
      //   - But typically letting rotation handle it is simpler.
    });

    // If we used a "layer.rotation" approach, we'd do layer.rotation(0) here,
    // but in this approach we assume the layer was never rotated to begin with.
    layer.batchDraw();
  }

  /**
   * Returns how many degrees we rotate from oldOrientation to newOrientation.
   * e.g. old=0, new=90 => +90 deg
   *      old=270, new=180 => -90 deg
   */
  private getAngleDelta(oldO: Orientation, newO: Orientation): number {
    // Simplify to a numeric scale: 0=0°, 1=90°, 2=180°, 3=270°.
    // Then compute difference. For example,
    // if old=0, new=90 => difference=+90,
    // if old=270, new=180 => difference=-90, etc.
    // We'll do a small function to keep it clean:

    const numOld = oldO / 90; // e.g. 0,1,2,3
    const numNew = newO / 90;

    // naive difference
    let diff = (numNew - numOld) * 90; // in degrees
    // Normalize to range -180..180 or similar
    if (diff > 180)  diff -= 360;
    if (diff < -180) diff += 360;

    return diff;  // e.g. +90, -90, +180, -180
  }

  // ---------------------------------------------------
  // Zoom
  // ---------------------------------------------------
  public zoom(factor: number): void {
    if (factor <= 0) return;
    this.currentZoom = factor;
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

  // ---------------------------------------------------
  // Add Image
  // ---------------------------------------------------
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

      // Decide un-rotated base dimension
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
        draggable: false,
      });

      layer.add(konvaImg);
      layer.draw();
    };
  }

  // ---------------------------------------------------
  // Draw Rectangles
  // ---------------------------------------------------
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

  private handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (this.isDrawing && this.currentPageIndex >= 0) {
      const pos = this.stage.getPointerPosition();
      if (!pos) return;

      this.drawStartPos = { x: pos.x, y: pos.y };
      this.newRect = new Konva.Rect({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        fill: 'rgba(0, 0, 255, 0.2)',
        stroke: 'blue',
        strokeWidth: 1,
        draggable: true,
      });
      this.pages[this.currentPageIndex].add(this.newRect);
    } else {
      // Not drawing => selection
      this.handleSelection(e);
    }
  }

  private handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (this.isDrawing && this.drawStartPos && this.newRect) {
      const pos = this.stage.getPointerPosition();
      if (!pos) return;

      const width = pos.x - this.drawStartPos.x;
      const height = pos.y - this.drawStartPos.y;

      this.newRect.x(Math.min(this.drawStartPos.x, pos.x));
      this.newRect.y(Math.min(this.drawStartPos.y, pos.y));
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
