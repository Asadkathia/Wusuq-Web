import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

interface AuthedRequest extends Request {
  user: { sub: string };
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('initiate')
  initiate(@Body() dto: InitiatePaymentDto, @Req() req: AuthedRequest) {
    return this.payments.initiate(dto.ticketId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':paymentId')
  getById(@Param('paymentId') paymentId: string, @Req() req: AuthedRequest) {
    return this.payments.getById(paymentId, req.user.sub);
  }

  @Public()
  @Get('by-txn/:providerTxnId')
  getByTxn(@Param('providerTxnId') providerTxnId: string) {
    return this.payments.getByProviderTxnId(providerTxnId);
  }

  @Public()
  @HttpCode(200)
  @Post('webhook/:provider')
  webhook(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string>,
  ) {
    return this.payments.handleWebhook(provider, body, headers);
  }

  @Public()
  @Post('mock/:providerTxnId/resolve')
  resolveMock(
    @Param('providerTxnId') providerTxnId: string,
    @Body() body: { outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED' },
  ) {
    return this.payments.devResolveMock(providerTxnId, body.outcome);
  }
}
