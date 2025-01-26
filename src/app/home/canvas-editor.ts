import Konva from 'konva';
import { BehaviorSubject } from 'rxjs';

export class CanvasEditor {
  private stage!: Konva.Stage;
  private pages: {
    group: Konva.Group;
    originalWidth: number;
    originalHeight: number;
    rotation: number;
  }[] = [];
  private _currentPageIndex: number = -1;
  private readonly baseDimensions: { width: number; height: number };
  // Add a class property to track the background rectangle
  private baseBackgroundRect: Konva.Rect | null = null;

  private isDrawingRectangle: boolean = false;
  private rectStartPos: { x: number; y: number } | null = null;
  private currentRectangle: Konva.Rect | null = null;

  private rectangleDrawingHandler:
    | ((e: Konva.KonvaEventObject<MouseEvent>) => void)
    | null = null;

  private pageIndexSubject = new BehaviorSubject<number>(
    this._currentPageIndex
  );
  public pageIndex$ = this.pageIndexSubject.asObservable();

  private set currentPageIndex(value: number) {
    this._currentPageIndex = value;
    this.pageIndexSubject.next(value);
  }

  private pageCountSubject = new BehaviorSubject<number>(0);
  public pageCount$ = this.pageCountSubject.asObservable();

  private _isStageDraggable: boolean = false;

  private get isStageDraggable(): boolean {
    return this._isStageDraggable;
  }

  private set isStageDraggable(value: boolean) {
    this._isStageDraggable = value;
    this.stage.draggable(value);
  }

  private selectedRectangle: Konva.Rect | null = null;

  constructor(private container: HTMLDivElement) {
    this.baseDimensions = {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    };
    this.init();
  }

  // In the init method, store the background rectangle reference
  init() {
    console.log(
      `Container width: ${this.container.clientWidth}, height: ${this.container.clientHeight}`
    );
    this.stage = new Konva.Stage({
      container: this.container,
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    });

    const baseLayer = new Konva.Layer();
    this.stage.add(baseLayer);
    this.baseBackgroundRect = new Konva.Rect({
      width: this.stage.width(),
      height: this.stage.height(),
      fill: 'lightblue',
    });
    baseLayer.add(this.baseBackgroundRect);
  }

  destroy() {
    if (this.stage) {
      this.stage.destroy();
    }
  }

  addPage(options?: { width?: number; height?: number }) {
    const width = options?.width || this.baseDimensions.width;
    const height = options?.height || this.baseDimensions.height;

    const pageGroup = new Konva.Group({
      width,
      height,
      offset: { x: width / 2, y: height / 2 },
      visible: false,
    });

    // Store page metadata
    this.pages.push({
      group: pageGroup,
      originalWidth: width,
      originalHeight: height,
      rotation: 0,
    });

    this.pageCountSubject.next(this.pages.length);
    this.stage.getLayers()[0].add(pageGroup);
    this.showPage(this.pages.length - 1);
  }

  showPage(pageIndex: number) {
    const pageData = this.pages[pageIndex];

    // Update stage to match page's effective dimensions
    const isVertical = pageData.rotation % 180 === 90;
    const effectiveWidth = isVertical
      ? pageData.originalHeight
      : pageData.originalWidth;
    const effectiveHeight = isVertical
      ? pageData.originalWidth
      : pageData.originalHeight;

    this.stage.width(effectiveWidth);
    this.stage.height(effectiveHeight);

    // Update background rectangle
    if (this.baseBackgroundRect) {
      this.baseBackgroundRect.width(effectiveWidth);
      this.baseBackgroundRect.height(effectiveHeight);
    }

    // Position all pages to new center
    this.pages.forEach((p) =>
      p.group.position({
        x: effectiveWidth / 2,
        y: effectiveHeight / 2,
      })
    );

    // Update visibility
    this.pages.forEach((p, index) => {
      p.group.visible(index === pageIndex);
    });

    // Clear selection when changing pages
    if (this.selectedRectangle) {
      this.selectedRectangle.stroke('black');
      this.selectedRectangle.strokeWidth(1);
      this.selectedRectangle = null;
    }

    this.currentPageIndex = pageIndex;
    this.stage.batchDraw();
  }

  showNextPage() {
    if (this._currentPageIndex === this.pages.length - 1) return;
    this.showPage(this._currentPageIndex + 1);
    this.resetZoom();
  }

  showPreviousPage() {
    if (this._currentPageIndex === 0) return;
    this.showPage(this._currentPageIndex - 1);
    this.resetZoom();
  }

  private get currentPage(): Konva.Group {
    if (this._currentPageIndex === -1) throw new Error('No pages available');
    return this.pages[this._currentPageIndex].group; // Access .group from metadata
  }

  async addImage(url: string) {
    const image = await new Promise<Konva.Image>((resolve, reject) => {
      Konva.Image.fromURL(
        url,
        (image) => {
          resolve(image);
        },
        (error) => {
          reject(error);
        }
      );
    });

    const stageWidth = this.stage.width();
    const stageHeight = this.stage.height();
    const imageWidth = image.width();
    const imageHeight = image.height();

    // Calculate scale to fit the image on its longest edge
    const scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);

    image.setAttrs({
      x: stageWidth / 2 - (imageWidth * scale) / 2,
      y: stageHeight / 2 - (imageHeight * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      // draggable: true,
    });

    this.currentPage.add(image);
    console.log('Add image to page ' + this._currentPageIndex);
    this.stage.batchDraw();
  }

  // Transformation methods
  zoom(factor: number) {
    const currentScale = this.currentPage.scaleX();
    this.currentPage.scale({
      x: currentScale * factor,
      y: currentScale * factor,
    });
    this.isStageDraggable = currentScale * factor > 1;
    if (currentScale * factor <= 1) {
      this.recenterStage();
    }
    this.stage.batchDraw();
  }

  zoomIn() {
    this.zoom(1.2);
  }
  zoomOut() {
    this.zoom(1 / 1.2);
  }

  resetZoom() {
    this.currentPage.scale({ x: 1, y: 1 });
    this.isStageDraggable = false;
    this.recenterStage();
    this.stage.batchDraw();
  }

  recenterStage() {
    this.stage.position({ x: 0, y: 0 });
  }

  // Updated rotate method
  rotate(degrees: number) {
    const pageData = this.pages[this._currentPageIndex];
    const newRotation = (pageData.rotation + degrees) % 360;
    pageData.rotation = newRotation;

    // Determine effective dimensions based on rotation
    const isVertical = newRotation % 180 === 90;
    const effectiveWidth = isVertical
      ? pageData.originalHeight
      : pageData.originalWidth;
    const effectiveHeight = isVertical
      ? pageData.originalWidth
      : pageData.originalHeight;

    // Update stage dimensions
    this.stage.width(effectiveWidth);
    this.stage.height(effectiveHeight);

    // Update background rectangle
    if (this.baseBackgroundRect) {
      this.baseBackgroundRect.width(effectiveWidth);
      this.baseBackgroundRect.height(effectiveHeight);
    }

    // Update page group transformations
    pageData.group.rotation(newRotation);
    pageData.group.position({
      x: effectiveWidth / 2,
      y: effectiveHeight / 2,
    });

    this.recenterStage();
    this.stage.batchDraw();
  }

  rotateLeft() {
    this.rotate(-90);
  }
  rotateRight() {
    this.rotate(90);
  }

  // Utility methods
  getPageCount(): number {
    return this.pages.length;
  }

  drawRectangle() {
    const stage = this.stage;

    // Remove any existing rectangle drawing listener
    if (this.rectangleDrawingHandler) {
      stage.off('mousedown touchstart', this.rectangleDrawingHandler);
      this.rectangleDrawingHandler = null;
    }

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Immediately remove listener to prevent multiple drawings
      stage.off('mousedown touchstart', handleMouseDown);
      this.rectangleDrawingHandler = null;

      if (this._currentPageIndex === -1 || this.isDrawingRectangle) return;

      const pos = this.getMousePos(e);
      if (!pos) return;

      stage.draggable(false);
      this.isDrawingRectangle = true;
      this.rectStartPos = pos;

      // Create new rectangle without removing existing ones
      this.currentRectangle = new Konva.Rect({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        fill: 'rgba(0,0,0,0.3)',
        stroke: 'black',
        strokeWidth: 1,
      });

      this.currentPage.add(this.currentRectangle);
      this.stage.batchDraw();

      const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (
          !this.isDrawingRectangle ||
          !this.rectStartPos ||
          !this.currentRectangle
        )
          return;

        let clientX: number, clientY: number;

        if (e instanceof MouseEvent) {
          clientX = e.clientX;
          clientY = e.clientY;
        } else if (e.touches?.[0]) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          return;
        }

        const containerRect = stage.container().getBoundingClientRect();
        const x = clientX - containerRect.left;
        const y = clientY - containerRect.top;

        const page = this.currentPage;
        const transform = page.getAbsoluteTransform().copy();
        const inverted = transform.invert();
        const pagePos = inverted.point({ x, y });

        const rectX = Math.min(this.rectStartPos.x, pagePos.x);
        const rectY = Math.min(this.rectStartPos.y, pagePos.y);
        const rectWidth = Math.abs(pagePos.x - this.rectStartPos.x);
        const rectHeight = Math.abs(pagePos.y - this.rectStartPos.y);

        this.currentRectangle.setAttrs({
          x: rectX,
          y: rectY,
          width: rectWidth,
          height: rectHeight,
        });

        this.stage.batchDraw();
      };

      const finalizeRectangle = () => {
        // Cleanup all temporary listeners
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('mouseup', finalizeRectangle);
        window.removeEventListener('touchend', finalizeRectangle);

        stage.draggable(this.isStageDraggable);
        this.isDrawingRectangle = false;

        // Add click handler to the finalized rectangle
        const finalizedRect = this.currentRectangle;
        if (finalizedRect) {
          finalizedRect.on('click', (e) => {
            this.handleRectangleClick(finalizedRect, e);
          });
        }

        this.rectStartPos = null;
        this.currentRectangle = null;
      };

      // Add temporary listeners for drag operation
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('mouseup', finalizeRectangle);
      window.addEventListener('touchend', finalizeRectangle);
    };

    this.rectangleDrawingHandler = handleMouseDown;
    stage.on('mousedown touchstart', handleMouseDown);
  }

  private handleRectangleClick(
    rect: Konva.Rect,
    e: Konva.KonvaEventObject<MouseEvent>
  ) {
    e.evt.stopPropagation(); // Correct way to prevent event bubbling

    if (this.selectedRectangle === rect) {
      // Deselect
      rect.stroke('black');
      rect.strokeWidth(1);
      this.selectedRectangle = null;
    } else {
      // Clear previous selection
      if (this.selectedRectangle) {
        this.selectedRectangle.stroke('black');
        this.selectedRectangle.strokeWidth(1);
      }
      // Select new rectangle
      rect.stroke('#ff0000');
      rect.strokeWidth(3);
      this.selectedRectangle = rect;
    }
    this.stage.batchDraw();
  }

  private getMousePos(
    e: Konva.KonvaEventObject<MouseEvent>
  ): { x: number; y: number } | null {
    if (this._currentPageIndex === -1) return null;

    const page = this.currentPage;
    const transform = page.getAbsoluteTransform().copy();
    const inverted = transform.invert();
    const pos = this.stage.getPointerPosition();

    if (!pos) return null;

    return inverted.point(pos);
  }

  deleteSelectedRedaction() {
    if (!this.selectedRectangle) return;

    this.selectedRectangle.destroy();
    this.selectedRectangle = null;
    this.stage.batchDraw();
  }
}
