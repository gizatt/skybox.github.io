// Floating, draggable, resizable image widget for overlay use
export class InsetImageWidget {
  private container: HTMLDivElement;
  private img: HTMLImageElement;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private startWidth = 0;
  private startHeight = 0;
  private imageAspect = 4 / 3; // Default aspect ratio
  private resizeHandle: HTMLDivElement;

  constructor(imageUrl: string, parent: HTMLElement = document.body) {
    this.container = document.createElement('div');
    this.container.className = 'inset-image-widget';
  this.container.style.position = 'fixed';
  this.container.style.top = '20px';
  this.container.style.right = '20px';
  this.container.style.left = '';
    this.container.style.width = '120px';
    this.container.style.height = '90px';
    this.container.style.zIndex = '1000';
    this.container.style.background = 'rgba(0,0,0,0.5)';
    this.container.style.borderRadius = '8px';
    this.container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'center';
    this.container.style.cursor = 'grab';

    this.img = document.createElement('img');
    this.img.src = imageUrl;
    this.img.style.maxWidth = '100%';
    this.img.style.maxHeight = '100%';
    this.img.style.borderRadius = '6px';
    this.img.draggable = false;
    this.img.onload = () => {
      if (this.img.naturalWidth && this.img.naturalHeight) {
        this.imageAspect = this.img.naturalWidth / this.img.naturalHeight;
        // Optionally, update widget size to match aspect
        const w = this.container.offsetWidth;
        this.container.style.height = (w / this.imageAspect) + 'px';
      }
    };
    this.container.appendChild(this.img);

    // Resize handle
    this.resizeHandle = document.createElement('div');
    this.resizeHandle.style.position = 'absolute';
    this.resizeHandle.style.right = '2px';
    this.resizeHandle.style.bottom = '2px';
    this.resizeHandle.style.width = '16px';
    this.resizeHandle.style.height = '16px';
    this.resizeHandle.style.background = 'rgba(255,255,255,0.7)';
    this.resizeHandle.style.borderRadius = '4px';
    this.resizeHandle.style.cursor = 'nwse-resize';
    this.container.appendChild(this.resizeHandle);

    parent.appendChild(this.container);

    // Drag events
    this.container.addEventListener('mousedown', this.onDragStart);
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);

    // Resize events
    this.resizeHandle.addEventListener('mousedown', this.onResizeStart);
    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
  }

  setImage(url: string) {
  this.img.src = url;
  // Aspect will update on image load
  }

  private onDragStart = (e: MouseEvent) => {
    if (e.target === this.resizeHandle) return;
    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.container.offsetLeft;
    this.dragOffsetY = e.clientY - this.container.offsetTop;
    this.container.style.cursor = 'grabbing';
    e.preventDefault();
  };

  private onDragMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    let x = e.clientX - this.dragOffsetX;
    let y = e.clientY - this.dragOffsetY;
    // Clamp to window
    x = Math.max(0, Math.min(window.innerWidth - this.container.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - this.container.offsetHeight, y));
    this.container.style.left = x + 'px';
    this.container.style.top = y + 'px';
  };

  private onDragEnd = (_e: MouseEvent) => {
    if (this.isDragging) {
      this.isDragging = false;
      this.container.style.cursor = 'grab';
    }
  };

  private onResizeStart = (e: MouseEvent) => {
    this.isResizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.startWidth = this.container.offsetWidth;
    this.startHeight = this.container.offsetHeight;
    e.stopPropagation();
    e.preventDefault();
  };

  private onResizeMove = (e: MouseEvent) => {
  if (!this.isResizing) return;
  const dx = e.clientX - this.resizeStartX;
  let newWidth = Math.max(60, this.startWidth + dx);
  let newHeight = Math.max(45, newWidth / this.imageAspect);
  this.container.style.width = newWidth + 'px';
  this.container.style.height = newHeight + 'px';
  };

  private onResizeEnd = (_e: MouseEvent) => {
    if (this.isResizing) {
      this.isResizing = false;
    }
  };

  destroy() {
    this.container.remove();
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
  }
}
