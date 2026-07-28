import { Controller, Get, Header } from '@nestjs/common';
import { CatalogService, type MenuResponseDto } from './catalog.service.js';

@Controller('menu')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /**
   * `GET /api/v1/menu` — the entire catalogue in one payload.
   *
   * The single most important endpoint in the product: everything the storefront renders comes
   * from here, and it must stay fast and always available.
   */
  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async getMenu(): Promise<MenuResponseDto> {
    return this.catalog.getMenu();
  }
}
