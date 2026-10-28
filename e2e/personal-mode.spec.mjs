import { test, expect } from '@playwright/test';
import C from '../Core.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ issues }) => {
    const h=window.personalHarness={issues,mode:'personal',loads:0,comments:[]};
    const original=window.setInterval;
    window.setInterval=(callback,delay,...args)=>delay===45000 ? (h.poll=callback,999) : original(callback,delay,...args);
    window.google={script:{}};
    Object.defineProperty(window.google.script,'run',{get(){return {
      withSuccessHandler(fn){this.success=fn;return this;},
      withFailureHandler(fn){this.failure=fn;return this;},
      getProject(){h.loads++;queueMicrotask(()=>this.success({issues:h.issues,mode:h.mode,commentsLazy:true,comments:{},settings:[],spreadsheetUrl:''}));},
      getTaskComments(id){h.comments.push({id,success:this.success,failure:this.failure});}
    };}});
  },{issues:[1,2].map(n=>({...C.blank(),id:`PRJ-${n}`,summary:`Task ${n}`,version:`v${n}`,rank:n*1000}))});
  await page.goto('/');
  await expect(page.locator('[data-issue="PRJ-1"]')).toBeVisible();
});

test('personal mode skips automatic polls while manual refresh and team polling work',async ({page})=>{
  await page.evaluate(()=>personalHarness.poll());
  expect(await page.evaluate(()=>personalHarness.loads)).toBe(1);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>personalHarness.loads)).toBe(2);
  await page.evaluate(()=>{personalHarness.mode='team';});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>personalHarness.loads)).toBe(3);
  await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();
  await page.evaluate(()=>personalHarness.poll());
  await expect.poll(()=>page.evaluate(()=>personalHarness.loads)).toBe(4);
});

test('comments load on opening a task and a late response cannot replace another task discussion',async ({page})=>{
  expect(await page.evaluate(()=>personalHarness.comments.length)).toBe(0);
  await page.locator('[data-issue="PRJ-1"]').click();
  await expect(page.locator('#comments-section')).toContainText('Loading comments');
  await page.getByRole('button',{name:'Close issue',exact:true}).click();
  await page.locator('[data-issue="PRJ-2"]').click();
  await page.evaluate(()=>personalHarness.comments[0].success([{id:'COM-1',taskId:'PRJ-1',body:'First task discussion'}]));
  await expect(page.locator('#comments-section')).toContainText('Loading comments');
  await expect(page.locator('#comments-section')).not.toContainText('First task discussion');
  await page.evaluate(()=>personalHarness.comments[1].success([{id:'COM-2',taskId:'PRJ-2',body:'Second task discussion'}]));
  await expect(page.locator('#comments-section')).toContainText('Comments (1)');
  await expect(page.locator('[data-comment-edit="COM-2"]')).toHaveValue('Second task discussion');
});

test('a comment load failure can be retried without closing the editor',async ({page})=>{
  await page.locator('[data-issue="PRJ-1"]').click();
  await page.evaluate(()=>personalHarness.comments[0].failure({message:'Temporary comment error'}));
  await expect(page.locator('#comments-section')).toContainText('Temporary comment error');
  await page.getByRole('button',{name:'Retry comments',exact:true}).click();
  await page.evaluate(()=>personalHarness.comments[1].success([]));
  await expect(page.locator('#comments-section')).toContainText('Comments (0)');
  await expect(page.getByRole('textbox',{name:'New comment',exact:true})).toBeVisible();
});
