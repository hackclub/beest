import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SidekickAuthGuard } from './sidekick-auth.guard';
import { SidekickExceptionFilter } from './sidekick-exception.filter';
import { SidekickService } from './sidekick.service';

/**
 * The single master endpoint Sidekick (the external review / fulfillment
 * console) talks to: every request is a POST with `{ action, input }` — see
 * sidekick/docs/PROTOCOL.md. Auth is a static shared secret (SIDEKICK_SECRET),
 * so the endpoint is exempt from the per-user throttler (a server-to-server
 * caller would otherwise share the frontend proxy's IP bucket).
 */
@Controller('api/sidekick')
@SkipThrottle()
@UseGuards(SidekickAuthGuard)
@UseFilters(SidekickExceptionFilter)
export class SidekickController {
  constructor(private readonly sidekick: SidekickService) {}

  @Post()
  @HttpCode(200)
  async handle(@Body() body: unknown) {
    const { action, input } = parseRequest(body);

    switch (action) {
      case 'HEALTH_CHECK':
        return this.sidekick.healthCheck();
      case 'GET_PROGRAM_STATS':
        return this.sidekick.getProgramStats();
      case 'FETCH_PROJECTS':
        return this.sidekick.fetchProjects(input);
      case 'FETCH_PROJECT_DETAIL':
        return this.sidekick.fetchProjectDetail(input.projectId);
      case 'FETCH_PROJECT_TIMELINE':
        return this.sidekick.fetchProjectTimeline(input.projectId);
      case 'FETCH_AUTHOR_PROJECTS':
        return this.sidekick.fetchAuthorProjects(input);
      case 'FETCH_USER_NOTE':
        return this.sidekick.fetchUserNote(input);
      case 'UPDATE_USER_NOTE':
        return this.sidekick.updateUserNote(input);
      case 'SUBMIT_REVIEW_ACTION':
        return this.sidekick.submitReviewAction(input);
      case 'UPDATE_REVIEW_ACTION':
        return this.sidekick.updateReviewAction(input);
      case 'FETCH_SHOP_ITEMS':
        return this.sidekick.fetchShopItems();
      case 'FETCH_ORDERS':
        return this.sidekick.fetchOrders(input);
      case 'FETCH_ORDER_DETAIL':
        return this.sidekick.fetchOrderDetail(input.orderId);
      case 'REVEAL_ORDER_ADDRESS':
        return this.sidekick.revealOrderAddress(input.orderId);
      case 'UPDATE_ORDER_STATUS':
        return this.sidekick.updateOrderStatus(input);
      case 'UPDATE_ORDER_FIELDS':
        return this.sidekick.updateOrderFields(input);
      case 'UPDATE_ITEM_FIELDS':
        return this.sidekick.updateItemFields(input);
      default:
        throw new BadRequestException({
          error: 'INVALID_ACTION',
          message: `Unknown action: ${String(action)}`,
        });
    }
  }
}

function parseRequest(body: unknown): { action: string; input: any } {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException({
      error: 'VALIDATION_ERROR',
      message: 'Request body must be a JSON object with { action, input }.',
    });
  }
  const { action, input } = body as { action?: unknown; input?: unknown };
  if (typeof action !== 'string' || action.length === 0) {
    throw new BadRequestException({
      error: 'VALIDATION_ERROR',
      message: 'action must be a non-empty string.',
    });
  }
  if (input !== undefined && (typeof input !== 'object' || input === null)) {
    throw new BadRequestException({
      error: 'VALIDATION_ERROR',
      message: 'input must be an object when present.',
    });
  }
  return { action, input: input ?? {} };
}
