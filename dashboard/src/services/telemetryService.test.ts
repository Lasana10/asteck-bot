import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({
 publishMapSignal:vi.fn(),
 fetchParticipantDispatches:vi.fn(),
 enqueue:vi.fn(),enqueueJourneySample:vi.fn(),flushJourneySamples:vi.fn(),
 watchPosition:vi.fn(),clearWatch:vi.fn(),
}));
vi.mock('../supabaseClient',()=>({
 publishMapSignal:mocks.publishMapSignal,fetchParticipantDispatches:mocks.fetchParticipantDispatches,
}));
vi.mock('./offlineSync',()=>({
 offlineSync:{enqueue:mocks.enqueue},
 createOfflineMutationId:()=> 'gps-real-immutable-key-123',
}));
vi.mock('./journeyTelemetryQueue',()=>({
 enqueueJourneySample:mocks.enqueueJourneySample,flushJourneySamples:mocks.flushJourneySamples,
}));
import {TelemetryService} from './telemetryService';
const gps=()=>({
 timestamp:Date.now(),
 coords:{latitude:3.866,longitude:11.516,altitude:null,speed:1.25,
   heading:90,accuracy:12},
}) as unknown as GeolocationPosition;
let callback:(pos:GeolocationPosition)=>void;
const service=TelemetryService.getInstance();
beforeEach(()=>{
 vi.clearAllMocks();
 vi.stubGlobal('navigator',{
   onLine:true,platform:'test-device',
   geolocation:{
     watchPosition:mocks.watchPosition.mockImplementation(cb=>{callback=cb;return 7;}),
     clearWatch:mocks.clearWatch,
   },
 });
 mocks.enqueue.mockResolvedValue(undefined);
 mocks.fetchParticipantDispatches.mockResolvedValue({data:{dispatches:[]},error:null});
 service.stop();
});
describe('one real GPS observation across live and offline mobility',()=>{
 it('replays online failure under the exact key used by the original live submission',async()=>{
  mocks.publishMapSignal.mockResolvedValue({data:null,error:{message:'passive ingest'}});
  service.start('alice','');
  callback(gps());
  await vi.waitFor(()=>expect(mocks.enqueue).toHaveBeenCalledTimes(1));
  expect(mocks.publishMapSignal).toHaveBeenCalledWith(expect.objectContaining({
    idempotency_key:'gps-real-immutable-key-123',
    signal_type:'movement',latitude:3.866,longitude:11.516,
  }));
  expect(mocks.enqueue).toHaveBeenCalledWith('INSERT_TELEMETRY',
    expect.objectContaining({latitude:3.866,longitude:11.516}),
    'gps-real-immutable-key-123');
 });
 it('does not create offline duplicates when live server returns genuine acceptance',async()=>{
  mocks.publishMapSignal.mockResolvedValue({
   data:{success:true,accepted:true,movement:{id:'m',idempotency_key:'gps-real-immutable-key-123'}},
   error:null,
  });
  service.start('alice','');
  callback(gps());
  await vi.waitFor(()=>expect(mocks.publishMapSignal).toHaveBeenCalledTimes(1));
  expect(mocks.enqueue).not.toHaveBeenCalled();
 });
 it('collects disconnected observation with the same immutable server identity',async()=>{
  vi.stubGlobal('navigator',{
    onLine:false,platform:'test-device',
    geolocation:{watchPosition:mocks.watchPosition.mockImplementation(cb=>{callback=cb;return 7;}),
      clearWatch:mocks.clearWatch},
  });
  service.start('alice','');
  callback(gps());
  await vi.waitFor(()=>expect(mocks.enqueue).toHaveBeenCalledTimes(1));
  expect(mocks.publishMapSignal).not.toHaveBeenCalled();
  expect(mocks.enqueue.mock.calls[0][2]).toBe('gps-real-immutable-key-123');
 });
});
