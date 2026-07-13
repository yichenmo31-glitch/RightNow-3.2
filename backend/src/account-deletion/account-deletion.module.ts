import { Module } from '@nestjs/common';
import { UploadQuarantineService } from './upload-quarantine.service';
import { AccountDeletionWorker } from './account-deletion.worker';
import { OpenClawModule } from '../openclaw/openclaw.module';

@Module({
  imports: [OpenClawModule],
  providers: [UploadQuarantineService, AccountDeletionWorker],
  exports: [UploadQuarantineService, AccountDeletionWorker],
})
export class AccountDeletionModule {}
