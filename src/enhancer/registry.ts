import { StyleEnhancement, StyleEnhancementType } from '../types';

/**
 * Registry for tracking style enhancements that need post-processing
 * after initial PPTX generation via pptxgenjs
 */
export class StyleEnhancementRegistry {
  private enhancements: StyleEnhancement[] = [];

  /**
   * Register a style enhancement for an element
   */
  register(enhancement: StyleEnhancement): void {
    this.enhancements.push(enhancement);
  }

  /**
   * Get all enhancements for a specific slide
   */
  getForSlide(slideIndex: number): StyleEnhancement[] {
    return this.enhancements.filter(e => e.slideIndex === slideIndex);
  }

  /**
   * Get all enhancements of a specific type
   */
  getByType(type: StyleEnhancementType): StyleEnhancement[] {
    return this.enhancements.filter(e => e.type === type);
  }

  /**
   * Get all registered enhancements
   */
  getAll(): StyleEnhancement[] {
    return [...this.enhancements];
  }

  /**
   * Get count of registered enhancements
   */
  count(): number {
    return this.enhancements.length;
  }

  /**
   * Clear all registered enhancements
   */
  clear(): void {
    this.enhancements = [];
  }
}
