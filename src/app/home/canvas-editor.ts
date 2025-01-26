import Konva from 'konva';

export class CanvasEditor {
  private stage!: Konva.Stage;
  private pages: Konva.Group[] = [];
  private _currentPageIndex: number = -1;
  private readonly baseDimensions: { width: number, height: number };

  private isDrawingRectangle: boolean = false;
  private rectStartPos: { x: number, y: number } | null = null;
  private currentRectangle: Konva.Rect | null = null;

  private rectangleDrawingHandler: ((e: Konva.KonvaEventObject<MouseEvent>) => void) | null = null;

  constructor(private container: HTMLDivElement) {
    this.baseDimensions = { width: this.container.clientWidth, height: this.container.clientHeight };
    this.init();
  }

  init() {
    console.log(`Container width: ${this.container.clientWidth}, height: ${this.container.clientHeight}`);
    this.stage = new Konva.Stage({
      container: this.container,
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      draggable: true,
    });

    // Create default layer
    const baseLayer = new Konva.Layer();
    this.stage.add(baseLayer);
    baseLayer.add(new Konva.Rect({
      width: this.stage.width(),
      height: this.stage.height(),
      fill: 'lightblue',
    }));
    // this.addPage(); // Create first page by default
  }

  destroy() {
    if (this.stage) {
      this.stage.destroy();
    }
  }

  addPage() {
    if (!this.stage) throw new Error('Stage not initialized');

    const pageGroup = new Konva.Group({
      width: this.baseDimensions.width,
      height: this.baseDimensions.height,
      offset: { x: this.baseDimensions.width / 2, y: this.baseDimensions.height / 2 },
      visible: false,
    });

    // Position page at stage center
    pageGroup.position({
      x: this.stage.width() / 2,
      y: this.stage.height() / 2,
    });

    this.stage.getLayers()[0].add(pageGroup);
    this.pages.push(pageGroup);
    this.showPage(this.pages.length - 1);
  }

  showPage(pageIndex: number) {
    if (pageIndex >= this.pages.length) throw new Error('Invalid page index');

    this.pages.forEach((page, index) => {
      page.visible(index === pageIndex);
    });

    this._currentPageIndex = pageIndex;
    this.stage.batchDraw();
  }

  showNextPage() {
    if (this._currentPageIndex === this.pages.length - 1) return;
    this.showPage(this._currentPageIndex + 1);
  }

  showPreviousPage() {
    if (this._currentPageIndex === 0) return;
    this.showPage(this._currentPageIndex - 1);
  }

  private get currentPage(): Konva.Group {
    if (this._currentPageIndex === -1) throw new Error('No pages available');
    return this.pages[this._currentPageIndex];
  }

  async addImage(url: string) {
    const image = await new Promise<Konva.Image>((resolve, reject) => {
      Konva.Image.fromURL(url, (image) => {
        resolve(image);
      }, (error) => {
        reject(error);
      });
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
    this.currentPage.scale({ x: currentScale * factor, y: currentScale * factor });
    this.stage.draggable(currentScale * factor > 1);
    if (currentScale * factor <= 1) {
      this.recenterStage();
    }
    this.stage.batchDraw();
  }

  zoomIn() { this.zoom(1.2); }
  zoomOut() { this.zoom(1 / 1.2); }

  resetZoom() {
    this.currentPage.scale({ x: 1, y: 1 });
    this.stage.batchDraw();
  }

  recenterStage() {
    this.stage.position({ x: 0, y: 0 });
    this.stage.batchDraw();
  }

  rotate(degrees: number) {
    this.currentPage.rotation(this.currentPage.rotation() + degrees);
    this.stage.batchDraw();
  }

  rotateLeft() { this.rotate(-90); }
  rotateRight() { this.rotate(90); }

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
      if (this._currentPageIndex === -1 || this.isDrawingRectangle) return;

      const pos = this.getMousePos(e);
      if (!pos) return;

      stage.draggable(false);
      this.isDrawingRectangle = true;
      this.rectStartPos = pos;

      this.currentRectangle = new Konva.Rect({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        fill: 'black',
      });

      this.currentPage.add(this.currentRectangle);
      this.stage.batchDraw();

      const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!this.isDrawingRectangle || !this.rectStartPos || !this.currentRectangle) return;

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
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('mouseup', finalizeRectangle);
        window.removeEventListener('touchend', finalizeRectangle);

        stage.draggable(true);
        this.isDrawingRectangle = false;
        this.rectStartPos = null;
        this.currentRectangle = null;

        // Remove the mousedown listener after drawing completes
        stage.off('mousedown touchstart', handleMouseDown);
        this.rectangleDrawingHandler = null;
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('mouseup', finalizeRectangle);
      window.addEventListener('touchend', finalizeRectangle);
    };

    this.rectangleDrawingHandler = handleMouseDown;
    stage.on('mousedown touchstart', handleMouseDown);
  }

  private getMousePos(e: Konva.KonvaEventObject<MouseEvent>): { x: number, y: number } | null {
    if (this._currentPageIndex === -1) return null;

    const page = this.currentPage;
    const transform = page.getAbsoluteTransform().copy();
    const inverted = transform.invert();
    const pos = this.stage.getPointerPosition();

    if (!pos) return null;

    return inverted.point(pos);
  }
}
