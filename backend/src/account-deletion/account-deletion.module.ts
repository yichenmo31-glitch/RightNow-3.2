import { Module } from '@nestjs/common';
import { UploadQuarantineService } from './upload-quarantine.service';

@Module({
  providers: [UploadQuarantineService],
  exports: [UploadQuarantineService],
})
export class AccountDeletionModule {}
