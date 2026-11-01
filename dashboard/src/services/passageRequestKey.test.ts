import { describe,expect,it } from 'vitest';
import { finishPassageRequest,pendingPassageRequestKey } from './passageRequestKey';

describe('passage request retries',()=>{
  it('reuses a pending network attempt across a reload and rotates after server success',()=>{
    const values=new Map<string,string>();
    const storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
    let n=0; const makeId=()=>`attempt-${++n}`;
    const first=pendingPassageRequestKey('passenger-one','place:car',storage,makeId);
    expect(pendingPassageRequestKey('passenger-one','place:car',storage,makeId)).toBe(first);
    finishPassageRequest('passenger-one',first,storage);
    expect(pendingPassageRequestKey('passenger-one','place:car',storage,makeId)).not.toBe(first);
  });
  it('does not clear another destination attempt when a delayed response arrives',()=>{
    const values=new Map<string,string>();
    const storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
    const old=pendingPassageRequestKey('passenger-two','old:car',storage,()=> 'old');
    const next=pendingPassageRequestKey('passenger-two','next:moto',storage,()=> 'next');
    finishPassageRequest('passenger-two',old,storage);
    expect(pendingPassageRequestKey('passenger-two','next:moto',storage,()=> 'other')).toBe(next);
  });
});
