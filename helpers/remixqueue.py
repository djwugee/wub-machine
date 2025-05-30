import config, os, time, database, traceback, logging, asyncio
from helpers.web import ordinal
from datetime import datetime, timedelta

class RemixQueue():
    def __init__(self, sio_instance, progress_listeners_map, progress_namespace_path, monitor_handler_class, monitor_namespace_path, logger, config_instance):
        self.sio = sio_instance
        self.progress_listeners = progress_listeners_map
        self.progress_namespace_path = progress_namespace_path
        self.MonitorHandler = monitor_handler_class
        self.monitor_namespace_path = monitor_namespace_path
        self.log = logger
        self.config = config_instance
        
        self.remixers = {}
        self.finished = {}
        self.cleanups = {}
        self.watching = {} # uid -> original user_callback (sync wrapper for progress)
        self.queue    = []
        self.running  = []

    async def emit_progress_update(self, uid, data):
        sid = self.progress_listeners.get(uid)
        if sid:
            try:
                await self.sio.emit('progress_update', data, room=sid, namespace=self.progress_namespace_path)
            except Exception as e:
                self.log.error(f"RemixQueue: Error emitting progress update to SID {sid} for UID {uid}: {e}")
        # else:
            # self.log.warning(f"RemixQueue: No SID found for UID {uid} in progress_listeners for emit_progress_update")

    async def emit_monitor_update_for_remixer(self, uid):
        try:
            # Assuming MonitorHandler.track and .overview are synchronous class methods
            # If they do I/O or are CPU bound, they should be run in a thread pool
            track_data_html = await asyncio.to_thread(self.MonitorHandler.track, uid)
            overview_data_html = await asyncio.to_thread(self.MonitorHandler.overview)
            
            await self.sio.emit('monitor_track_update', track_data_html, namespace=self.monitor_namespace_path)
            await self.sio.emit('monitor_overview_update', overview_data_html, namespace=self.monitor_namespace_path)
        except Exception as e:
            self.log.error(f"RemixQueue: Error emitting monitor updates for UID {uid}: {e}")

    async def add(self, uid, ext, remixer_class, done_callback): # Changed remixer to remixer_class
        self.log.debug("Adding remixer %s to queue..." % uid)
        if uid in self.remixers:
            raise Exception("Song already received!")

        infile = os.path.join("uploads/", "%s%s" % (uid, ext))
        outfile = os.path.join("static/songs/", "%s.mp3" % uid)

        # Create synchronous wrappers for asyncio coroutines to be called from worker thread
        # These wrappers will schedule the async functions on the main event loop
        
        # Wrapper for progress updates from the remixer thread
        # The remixer calls this with `data`
        def sync_progress_callback(data):
            asyncio.run_coroutine_threadsafe(self.emit_progress_update(uid, data), self.sio.eio.loop)

        # Wrapper for monitor updates from the remixer thread (if a remixer directly triggers this)
        # The remixer calls this with `uid_arg` (which should be `uid` itself)
        def sync_monitor_callback_for_remixer(uid_arg):
             asyncio.run_coroutine_threadsafe(self.emit_monitor_update_for_remixer(uid_arg), self.sio.eio.loop)

        # The remixer class expects two callbacks:
        # 1. A callback for monitor updates (originally MonitorSocket.update(uid))
        # 2. A callback for progress updates (originally ProgressSocket.update(uid, data))
        #    The old ProgressSocket.update was a classmethod taking (uid, data).
        #    The lambda `user_callback = lambda data: _user_callback(uid, data)` adapted this.
        #    So the second callback passed to the remixer should expect only `data`.
        self.remixers[uid] = remixer_class(self, str(infile), str(outfile), [sync_monitor_callback_for_remixer, sync_progress_callback])
        
        # self.watching was used to store the original _user_callback (ProgressSocket.update)
        # Now it should store a way to send "waiting" status if needed, or be re-evaluated.
        # For now, let's keep the structure but ensure it uses the new mechanism if used.
        # The original _user_callback was ProgressSocket.update.
        # notifyWatchers calls this lambda.
        self.watching[uid] = lambda data: asyncio.run_coroutine_threadsafe(self.emit_progress_update(uid, data), self.sio.eio.loop)

        self.cleanups[uid] = done_callback
        self.queue.append(uid)
        # No automatic start here, it's triggered by ProgressNamespace.on_client_uid usually

    async def updateTrack(self, uid, tag):
        # This may be called from another thread: let's use a unique DB connection.
        self.log.info("Updating track %s..." % uid)
        db = database.Session()
        try:
            track = db.query(database.Track).filter_by(uid = uid).first()
            keep = ['length', 'samplerate', 'channels', 'bitrate', 'title', 'artist', 'album', 'art', 'thumbnail']
            for a in tag:
                if a in keep:
                    try:
                        track.__setattr__(a, tag[a])
                    except:
                        pass
            db.commit()
            self.log.info("Track %s updated!" % uid)
        except:
            self.log.error("DB error when updating %s, rolling back:\n%s" % (uid, traceback.format_exc()))
            db.rollback()
            
    async def finish(self, uid, final=None):
        self.log.debug("Finishing remixer %s from queue..." % uid)
        try:
            if not uid in self.remixers:
                return False
            if self.remixers[uid].isAlive(): # Assuming isAlive is synchronous
                await asyncio.to_thread(self.stop, uid) # stop involves thread join, make it non-blocking for asyncio
            del self.remixers[uid]
            if not final:
                final = { 'status': -1, 'text': "Sorry, this remix is taking too long. Try again later!", 'progress': 0, 'uid': uid, 'time': time.time() }
            
            if uid in self.running: # Check before removing
                self.running.remove(uid)
            else:
                self.log.warning(f"UID {uid} not in running list during finish.")

            self.finished[uid] = final
            if uid in self.cleanups and self.cleanups[uid]:
                # done_callback (UploadHandler.trackDone) is now async
                await self.cleanups[uid](final)
                del self.cleanups[uid]
            
            # DB stuff (run in thread to avoid blocking)
            def db_finish_operations():
                db = database.Session()
                try:
                    event = db.query(database.Event).filter_by(action='remix', uid=uid).first()
                    if event: # Ensure event exists
                        event.end = datetime.now()
                        if final['status'] == -1: # Use == for comparison
                            event.success = False
                            event.detail = final.get('debug')
                        else:
                            event.success = True
                        db.commit()
                    else:
                        self.log.warning(f"No remix event found for UID {uid} during finish.")
                except Exception as e_db: # Catch specific Exception
                    db.rollback()
                    self.log.error(f"DB error when finishing {uid} from queue:\n{e_db}\n{traceback.format_exc()}")
                finally:
                    db.close()
            await asyncio.to_thread(db_finish_operations)

            await self.notifyWatchers() # Ensure notifyWatchers is async or uses run_coroutine_threadsafe for callbacks
            asyncio.create_task(self.emit_monitor_update_for_remixer(uid)) # Changed from self.monitor_callback
            self.log.debug("Remixer %s finished! Calling next()..." % uid)
            await self.next() # Ensure next is async
        except Exception as e_finish: # Catch specific Exception
            self.log.error(f"Could not finish {uid} from queue:\n{e_finish}\n{traceback.format_exc()}")

    async def remove(self, uid):
        try:
            if uid in self.remixers:
                if self.remixers[uid].isAlive(): # Sync
                    await asyncio.to_thread(self.stop, uid) # stop involves thread join
                del self.remixers[uid]
                final = { 'status': -1, 'text': "Sorry, this remix is taking too long. Try again later!", 'progress': 0, 'uid': uid, 'time': time.time() }
                
                if uid in self.watching and self.watching[uid]:
                    # self.watching[uid] is now a sync wrapper that calls emit_progress_update
                    self.watching[uid](final) # Call the sync wrapper

                self.finished[uid] = final
                if uid in self.cleanups and self.cleanups[uid]:
                    # done_callback (UploadHandler.trackDone) is now async
                    await self.cleanups[uid](None) 
                    del self.cleanups[uid]

                # DB stuff (run in thread)
                def db_remove_operations():
                    db = database.Session()
                    try:
                        event = db.query(database.Event).filter_by(action='remix', uid=uid).first()
                        if event:
                            event.end = datetime.now()
                            event.success = False
                            event.detail = "Timed out"
                        db.commit()
                    except Exception as e_db_rem: # Catch specific Exception
                        self.log.error(f"DB exception, rolling back for UID {uid} in remove:\n{e_db_rem}\n{traceback.format_exc()}")
                        db.rollback()
                    finally:
                        db.close()
                await asyncio.to_thread(db_remove_operations)
                
                await self.notifyWatchers() # Ensure async
                asyncio.create_task(self.emit_monitor_update_for_remixer(uid)) # Changed from self.monitor_callback

            if uid in self.queue:
                self.queue.remove(uid)
            if uid in self.running:
                self.running.remove(uid)
            self.log.info("Removed %s from queue." % uid)
        except Exception as e_rem: # Catch specific Exception
            self.log.error(f"Could not remove {uid} from queue:\n{e_rem}\n{traceback.format_exc()}")

    async def start(self, uid):
        if not uid in self.queue:
            # If called for a UID not in queue, log and return or raise specific error
            self.log.warning(f"Attempted to start UID {uid} not in queue.")
            return
            # raise Exception("Cannot start, remixer not waiting: %s" % uid)
        
        # Check if the remixer instance exists for the UID
        if uid not in self.remixers:
            self.log.warning(f"Remixer instance for UID {uid} not found at start.")
            if uid in self.queue: self.queue.remove(uid) # Clean up queue
            return

        # being_watched is set by ProgressNamespace.on_client_uid
        if not self.remixers[uid].being_watched:
            # This might happen if a client disconnects then reconnects quickly,
            # or if start is called before on_client_uid fully processes.
            self.log.info(f"Cannot start UID {uid}, not being watched. It will remain in queue or be handled by cleanup.")
            # Potentially, re-notify client if it's a timing issue, or rely on cleanup.
            # For now, do not proceed with start if not watched.
            return
            # raise Exception("Cannot start, nobody watching remixer: %s" % uid)

        self.running.append(uid)
        self.queue.remove(uid)
        
        if uid in self.watching: # Should exist if being_watched was true, but good to check.
            del self.watching[uid]
        
        # self.remixers[uid].start() is a blocking call (thread.start then thread.join in an internal loop)
        # It should be run in a separate thread managed by asyncio to not block the main loop.
        await asyncio.to_thread(self.remixers[uid].start)


        # DB operations in a thread
        def db_start_operations():
            db = database.Session()
            try:
                db.add(database.Event(uid, "remix"))
                db.commit()
            except Exception as e_db_start: # Catch specific Exception
                self.log.error(f"DB exception, rolling back for UID {uid} in start:\n{e_db_start}\n{traceback.format_exc()}")
                db.rollback()
            finally:
                db.close()
        await asyncio.to_thread(db_start_operations)
        
        asyncio.create_task(self.emit_monitor_update_for_remixer(uid)) # Changed from self.monitor_callback
      
    # stop is synchronous, as it involves thread.join()
    def stop(self, uid): # This remains synchronous as it's called from thread or needs careful async handling
        if uid in self.remixers and self.remixers[uid].isAlive(): # isAlive is sync
            self.log.info("Stopping thread %s..." % uid)
            self.remixers[uid].stop() # stop() itself is likely blocking / joining thread

    async def notifyWatchers(self):
        # self.watching now stores sync wrappers.
        for uid, sync_callback_wrapper in list(self.watching.items()): # Use list() for safe iteration if map changes
            # waitingResponse is sync, can be called directly
            response_data = await self.waitingResponse(uid) # make waitingResponse async
            sync_callback_wrapper(response_data) # Call the sync wrapper

    async def waitingResponse(self, uid): # Made async as it's called by async notifyWatchers
        # This method can remain largely synchronous in its logic, but called with await.
        if uid in self.queue:
            try:
                position = self.queue.index(uid)
                if position == 0 and not self.running: # Pythonic: == 0, and use self.running
                    text = "Starting..."
                elif position == 0 or position == 1: # Pythonic: == 0 or == 1
                    text = "Waiting... (next in line)"
                else:
                    text = "Waiting in line... (%s)" % ordinal(position + 1) # Queues are 0-indexed, users expect 1-indexed
            except ValueError: # uid might have been removed from queue concurrently
                self.log.warning(f"UID {uid} not found in queue during waitingResponse.")
                text = "Finalizing..." # Or some other appropriate status
        else:
            text = "Starting..." # Or "Processing..." if it's already running
        return { 'status': 0, 'text': text, 'progress': 0, 'uid': uid, 'time': time.time() }

    async def next(self):
        # Iterate over a copy if items might be removed during iteration
        for uid in list(self.queue): 
            if uid in self.watching: # Check if client is still watching (via self.watching map)
                try:
                    # self.start is now async
                    await self.start(uid) 
                    self.log.info("Started remixer %s from next()..." % uid)
                    break # Start one at a time
                except Exception as e_next_start: # Catch specific Exception
                    self.log.error(f"Error starting remixer {uid} from next(): {e_next_start}\n{traceback.format_exc()}")
                    # Potentially remove UID from queue or mark as error if start fails repeatedly
        else:
            # This else block executes if the loop completed without a break (i.e., no remixer was started)
            if not self.queue:
                self.log.info("No remixers in queue!")
            else:
                self.log.info("No remixers in queue are currently being watched.")


    async def cleanup(self): # Made async as it calls self.remove which is now async
        try:
            # Iterate over a copy of items for safe removal
            for uid, remixer in list(self.remixers.items()):
                current_time = time.time()
                # Using self.config consistently
                watch_timeout = self.config.watch_timeout if hasattr(self.config, 'watch_timeout') else 300 # Default 5 mins
                wait_timeout = self.config.wait_timeout if hasattr(self.config, 'wait_timeout') else 1800 # Default 30 mins
                remix_timeout_val = self.config.remix_timeout if hasattr(self.config, 'remix_timeout') else 3600 # Default 60 mins

                if watch_timeout and not remixer.started and not remixer.being_watched and remixer.added < (current_time - watch_timeout):
                    self.log.info(f"Remixer {uid} (unwatched) timed out ({watch_timeout}s). Removing...")
                    await self.remove(uid)
                elif wait_timeout and not remixer.started and remixer.added < (current_time - wait_timeout):
                    self.log.info(f"Remixer {uid} (waiting) timed out ({wait_timeout // 60}m). Removing...")
                    await self.remove(uid)
                elif remix_timeout_val and remixer.started and remixer.added < (current_time - remix_timeout_val): # Check if started for remix_timeout
                    self.log.info(f"Remixer {uid} (processing) timed out ({remix_timeout_val // 60}m). Removing...")
                    await self.remove(uid)
                elif uid in self.running and not remixer.isAlive(): # isAlive is sync
                    self.log.info(f"Remixer {uid} (running) found dead. Removing...")
                    await self.remove(uid) # remove is now async
        except Exception as e_cleanup: # Catch specific Exception
            self.log.error(f"RemixQueue cleanup went wrong:\n{e_cleanup}\n{traceback.format_exc()}")

    def isAvailable(self): # This can remain synchronous
        # Using self.config consistently
        max_concurrent = self.config.maximum_concurrent_remixes if hasattr(self.config, 'maximum_concurrent_remixes') else 1 # Default
        return len(self.running) < max_concurrent

    def isAccepting(self): # This can remain synchronous
        # Using self.config consistently
        max_waiting = self.config.maximum_waiting_remixes if hasattr(self.config, 'maximum_waiting_remixes') else 10 # Default
        hourly_limit = self.config.hourly_remix_limit if hasattr(self.config, 'hourly_remix_limit') else 100 # Default
        return len(self.queue) < max_waiting and self.countInHour() < hourly_limit

    def countInHour(self): # This can remain synchronous
        try:
            # Use list comprehension with .items() for Python 3 compatibility
            return len([v for k, v in self.finished.items() if 'time' in v and v['time'] > (time.time() - 3600)])
        except Exception as e_count: # Catch specific Exception
            self.log.error(f"RemixQueue countInHour went wrong:\n{self.finished}\n{e_count}\n{traceback.format_exc()}")
            return 0 # Return a value indicating error or an empty count

    def errorRate(self): # This can remain synchronous
        try:
            if not self.finished: return 0.0 # Avoid division by zero if finished is empty
            # Ensure 'status' key exists in dictionary 'item' before accessing it
            error_count = sum(1 for item in self.finished.values() if item.get('status') == -1)
            return float(error_count) / len(self.finished)
        except Exception as e_err_rate: # Catch specific Exception
            self.log.error(f"RemixQueue errorRate went wrong:\n{e_err_rate}\n{traceback.format_exc()}")
            return 0.0 # Return a float

    def errorRateExceeded(self): # This can remain synchronous
        # Using self.config consistently for error_rate_threshold if it exists
        error_threshold = self.config.error_rate_threshold if hasattr(self.config, 'error_rate_threshold') else 0.5 # Default
        return self.errorRate() > error_threshold

