import fs from 'node:fs';
import {verifyRoleAddressReview} from './prepare-role-address-review.mjs';

const file=process.env.ROLE_REVIEW_FILE;
if(!file)throw new Error('ROLE_REVIEW_FILE must point to the approved public role review JSON');
const review=JSON.parse(fs.readFileSync(file,'utf8'));
const verified=verifyRoleAddressReview(review,process.env);
process.stdout.write(`${JSON.stringify({status:'VERIFIED_FOR_ONCHAIN_PREFLIGHT',reviewFingerprint:verified.reviewFingerprint},null,2)}\n`);
