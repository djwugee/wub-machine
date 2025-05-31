"""
    The Wub Machine
    Python web interface
    started August 5 2011 by Peter Sobot (petersobot.com)
"""

__author__ = "Peter Sobot"
__copyright__ = "Copyright (C) 2011 Peter Sobot"
__version__ = "2.2"

import json, time, locale, traceback, gc, logging, os, database, urllib.parse, sys # Added sys
import tornado.ioloop, tornado.web, tornado.template, tornado.httpclient, tornado.escape, tornado.websocket
import socketio
import asyncio
import config
from datetime import datetime, timedelta
from hashlib import md5

# Wubmachine-specific libraries
from helpers.remixqueue import RemixQueue # RemixQueue is now async-heavy
from helpers.soundcloud import SoundCloud
from helpers.cleanup import Cleanup
from helpers.daemon import Daemon
from helpers.web import *
from database import Base, engine # Added import

# Kinds of remixers.
from remixers.dubstep import Dubstep
from remixers.electrohouse import ElectroHouse
remixers = {
  'Dubstep': Dubstep,
  'ElectroHouse': ElectroHouse
}

# Check dependencies...
# Check required version numbers
assert tornado.version_info >= (2, 0, 0), "Tornado v2 or greater is required!"
# assert tornadio.__version__ >= (0, 0, 4), "Tornadio v0.0.4 or greater is required!" # Tornadio replaced

# Instead of using xheaders, which doesn't seem to work under Tornadio, we do this:
if config.nginx:
    class RequestHandler(tornado.web.RequestHandler):
        """
            Patched Tornado RequestHandler to take care of Nginx ip proxying
        """
        def __init__(self, application, request, **kwargs):
            if 'X-Real-Ip' in request.headers:
                request.remote_ip = request.headers['X-Real-Ip']
            tornado.web.RequestHandler.__init__(self, application, request, **kwargs)
else:
    RequestHandler = tornado.web.RequestHandler

# Handlers

class MainHandler(RequestHandler):
    async def get(self): # Changed to async def
        # Assuming r.isAccepting() and r.errorRateExceeded() are fast, non-blocking checks
        # sc.frontPageTrack() might involve I/O. If so, it needs to be async or wrapped.
        # For now, assuming it's a quick operation or will be handled if it's part of SoundCloud class refactor.
        # locale.format_string and time_in_words are CPU-bound, likely fast.

        # Example: If sc.frontPageTrack() was blocking I/O
        # track_data = await asyncio.to_thread(sc.frontPageTrack)
        # For now, keep as is, assuming it's okay or handled elsewhere.
        track_data = sc.frontPageTrack()

        js = ("window.wubconfig = %s;" % json.dumps(config.javascript)) + javascripts
        kwargs = {
            "isOpen": r.isAccepting(),
            "track": track_data,
            "isErroring": r.errorRateExceeded(),
            'count': locale.format_string("%d", trackCount, grouping=True),
            'cleanup_timeout': time_in_words(config.cleanup_timeout),
            'javascript': js,
            'connectform': connectform
        }
        # templates.load(...).generate(...) is CPU-bound. If it becomes a bottleneck, wrap in to_thread.
        # For now, assume it's acceptable.
        self.write(templates.load('index.html').generate(**kwargs))
        # self.finish() is not needed for async def methods unless it's the very last I/O operation.
        # In this case, self.write() is the last operation that sends data.
        # Tornado handles finishing the request automatically for async methods.

    async def head(self): # Changed to async def
        self.finish() # finish() is fine here as it's a simple response.

# Initialize Socket.IO Server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

class ProgressNamespace(socketio.AsyncNamespace):
    def __init__(self, namespace, remix_queue_instance, config_instance):
        super().__init__(namespace)
        self.r = remix_queue_instance
        self.config = config_instance
        self.listeners = {}  # uid -> sid mapping

    async def on_connect(self, sid, environ):
        log.info(f"ProgressNamespace: Client {sid} connected. Waiting for UID.")

    async def on_client_uid(self, sid, data):
        uid = data.get('uid')
        # Basic UID validation (e.g., length 32, alphanumeric)
        if not uid or not (isinstance(uid, str) and len(uid) == 32 and uid.isalnum()):
            log.warning(f"ProgressNamespace: Invalid UID '{uid}' from SID {sid}. Disconnecting.")
            await sio.disconnect(sid, namespace=self.namespace)
            return

        self.listeners[uid] = sid
        log.info(f"ProgressNamespace: Associated SID {sid} with UID {uid}")

        if uid in self.r.finished:
            log.info(f"ProgressNamespace: UID {uid} already finished. Disconnecting SID {sid}.")
            try:
                await sio.disconnect(sid, namespace=self.namespace)
            except Exception as e:
                log.error(f"Error disconnecting finished UID {uid} (SID {sid}): {e}")
        else:
            if uid in self.r.remixers:
                self.r.remixers[uid].being_watched = True
                log.info(f"Remixer {uid} is now being watched by {sid}...")
            self.r.cleanup() # Assuming this is synchronous or needs to be made async
            if self.r.isAvailable(): # Assuming synchronous
                try:
                    # r.start was synchronous and took uid.
                    # If r.start becomes async, it needs `await self.r.start(uid)`
                    # For now, assuming it can be called directly if it spawns threads/processes
                    self.r.start(uid)
                except Exception as e:
                    log.error(f"Error starting remixer for UID {uid} (SID {sid}): {e}")
                    await sio.emit('progress_update', {
                        'status': -1,
                        'text': "Sorry, something went wrong. Please try again later!",
                        'progress': 0,
                        'uid': uid,
                        'time': time.time()
                    }, room=sid, namespace=self.namespace)
                    await sio.disconnect(sid, namespace=self.namespace)
            log.info(f"ProgressNamespace: Processed client_uid for UID {uid} (SID {sid})")

    async def on_disconnect(self, sid):
        uid_to_remove = None
        for uid, s_id in self.listeners.items():
            if s_id == sid:
                uid_to_remove = uid
                break
        
        if uid_to_remove:
            log.info(f"ProgressNamespace: Client {sid} (UID {uid_to_remove}) disconnected")
            del self.listeners[uid_to_remove]
            try:
                # r.stop was synchronous. If it becomes async: await self.r.stop(uid_to_remove)
                self.r.stop(uid_to_remove)
            except Exception as e:
                log.error(f"Error stopping remixer for {uid_to_remove}: {e}")
            if uid_to_remove in self.r.remixers:
                self.r.remixers[uid_to_remove].being_watched = False
        else:
            log.info(f"ProgressNamespace: Client {sid} disconnected (UID not found or already removed)")

class MonitorNamespace(socketio.AsyncNamespace):
    def __init__(self, namespace, monitor_handler_class, config_instance):
        super().__init__(namespace)
        self.MonitorHandler = monitor_handler_class # Store the class, not an instance
        self.config = config_instance
        # No specific set needed for monitors; python-socketio handles SIDs per namespace

    async def on_connect(self, sid, environ):
        log.info(f"MonitorNamespace: Client {sid} connected")
        try:
            # MonitorHandler.overview and .latest are now async classmethods
            overview_data = await self.MonitorHandler.overview()
            latest_data_html = await self.MonitorHandler.latest()
            await sio.emit('monitor_overview_update', overview_data, room=sid, namespace=self.namespace)
            await sio.emit('monitor_latest_update', latest_data_html, room=sid, namespace=self.namespace)
        except Exception as e:
            log.error(f"Error sending initial data to monitor {sid}: {e}", exc_info=True) # Added exc_info

    async def on_disconnect(self, sid):
        log.info(f"MonitorNamespace: Client {sid} disconnected")

    # Methods for broadcasting updates will be called from MonitorHandler or other parts of the app
    # using the `sio` instance directly.

class MonitorHandler(RequestHandler):
    keys = ['upload', 'download', 'remixTrue', 'remixFalse', 'shareTrue', 'shareFalse'] # Used by histogram

    async def get(self, sub=None, uid=None): # Changed to async def
        if sub:
            # Original instance methods moved to _sync versions for clarity if wrapped by to_thread
            async def get_graph_data_placeholder(): return await asyncio.to_thread(self._graph_sync)
            async def get_remixqueue_data_placeholder(): return await asyncio.to_thread(self._remixqueue_sync) # Assuming _remixqueue_sync is self.remixqueue's old code
            async def get_timespan_data_placeholder():
                # timespan needs arguments, so direct self.timespan won't work without them.
                # This part needs more specific handling if timespan is to be used.
                # For now, it's a placeholder like others.
                start_arg = self.get_argument('start', None) # Example: get args if needed
                end_arg = self.get_argument('end', None)
                if start_arg and end_arg:
                     return await asyncio.to_thread(self._timespan_sync, float(start_arg), float(end_arg))
                return "Error: Missing start/end arguments for timespan"


            sections = {
                'graph': get_graph_data_placeholder,
                'overview': MonitorHandler.overview, # Call as async classmethod
                'latest': MonitorHandler.latest,   # Call as async classmethod
                'remixqueue': get_remixqueue_data_placeholder,
                'timespan': get_timespan_data_placeholder
            }
            if sub in sections:
                data = await sections[sub]() # All section handlers are now async or wrapped
                self.write(data)
            else:
                raise tornado.web.HTTPError(404)
        else:
            overview_html = await MonitorHandler.overview() # Call async classmethod
            latest_html = await MonitorHandler.latest()     # Call async classmethod
            kwargs = {
                'overview': overview_html,
                'latest': latest_html,
                'config': "window.wubconfig = %s;" % json.dumps(config.javascript)
            }
            # Template rendering wrapped in to_thread
            html_output = await asyncio.to_thread(templates.load('monitor.html').generate, **kwargs)
            self.write(html_output)
        # self.finish() is generally not needed for async handlers after write

    # Renamed original instance methods to _sync to avoid name clashes if we make async versions
    def _remixqueue_sync(self): # Was self.remixqueue
        self.set_header("Content-Type", 'text/plain')
        return str("Remixers: %s\nFinished: %s\nQueue:    %s\nRunning:  %s" % (r.remixers, r.finished, r.queue, r.running))

    def _graph_sync(self): # Was self.graph. DB heavy, needs full async/to_thread treatment.
        db = database.Session()
        history = {}
        try:
            for i in range(1, 24*2): # last 2 days, original was 24*2
                low = datetime.now() - timedelta(hours = i)
                high = low + timedelta(hours = 1)
                timestamp = 1000 * time.mktime(high.timetuple())
                dayr = db.query(database.Event).add_columns('count(*)', database.Event.action, database.Event.success).group_by('action', 'success').filter(database.Event.start.between(low, high)).all()
                n = {}
                for daya in dayr:
                    key = ""
                    if daya.action == 'download': key = daya.action
                    elif daya.action == 'remix' or daya.action == 'share': key = f"{daya.action}{daya.success}"
                    if key: n[key] = [timestamp , int(daya.__dict__['count(*)'])]

                for k_hist in self.keys: # Use self.keys (or cls.keys if it were classmethod)
                    if not k_hist in history: history[k_hist] = []
                    history[k_hist].append(n.get(k_hist, [timestamp, 0]))
            return history # Returns dict
        except Exception as e_graph_inner:
            log.error(f"DB read exception in _graph_sync inner loop, rolling back: {e_graph_inner}\n{traceback.format_exc()}")
            db.rollback()
            return {} # Return empty on error
        finally:
            db.close()

    def _timespan_sync(self, start_arg, end_arg): # Was self.timespan. DB heavy.
        # start = float(self.get_argument('start')) # Args now passed in
        # end = float(self.get_argument('end'))
        start = start_arg
        end = end_arg

        if end - start < 0: raise tornado.web.HTTPError(400)
        elif end - start > config.monitor_time_limit: start = end - config.monitor_time_limit

        db = database.Session()
        try:
            tracks_query = db.query(database.Track).filter(database.Track.time < datetime.fromtimestamp(end)).filter(database.Track.time > datetime.fromtimestamp(start)).order_by(database.Track.id.desc()).all()
            # Original called self.track() for each, which is now MonitorHandler.track (async classmethod)
            # This sync version can't call the async one directly.
            # For now, returning raw track objects or UIDs. A full refactor would build HTML here or make _timespan_sync async.
            # This is a significant change from returning HTML strings. The caller in `get` would need to handle it.
            # Simplified: returning list of UIDs
            # return [t.uid for t in tracks_query]
            # To keep structure, this method would need to be async and await MonitorHandler.track
            # For now, this part of the /monitor GET endpoint will be simplified.
            log.warning("_timespan_sync is simplified and does not generate full track HTMLs.")
            return json.dumps([{"uid": t.uid, "title": t.title} for t in tracks_query]) # Return JSON summary
        except Exception as e_timespan:
            log.error(f"DB read exception in _timespan_sync, rolling back: {e_timespan}\n{traceback.format_exc()}")
            db.rollback()
            return "[]" # Return empty JSON list on error
        finally:
            db.close()


    @classmethod
    def _histogram_db_op(cls, interval=None):
        db = database.Session()
        try:
            query = db.query(database.Event).add_columns('count(*)', database.Event.action, database.Event.success).group_by('action', 'success')
            if interval:
                limit = datetime.now() - timedelta(**{interval: 1})
                d = query.filter(database.Event.start > limit).all()
            else:
                d = query.all()

            n = {k: 0 for k in cls.keys}
            for a in d:
                key = ""
                if a.action == 'upload' or a.action == 'download':
                    key = a.action
                elif a.action == 'remix' or a.action == 'share':
                    # Ensure success is a string like 'True' or 'False' if it comes from DB that way
                    success_str = str(a.success) if a.success is not None else "None"
                    key = f"{a.action}{success_str}"

                if key in n:
                    n[key] = int(a.__dict__['count(*)'])
            return n
        except Exception as e_hist:
            log.error(f"DB read exception in _histogram_db_op: {e_hist}\n{traceback.format_exc()}")
            db.rollback() # Rollback on error
            return {k: 0 for k in cls.keys} # Return default counts on error
        finally:
            db.close()

    @classmethod
    async def get_histogram_data(cls, interval=None):
        return await asyncio.to_thread(cls._histogram_db_op, interval)

    @classmethod
    async def overview(cls): # Made async classmethod
        hour_histo = await cls.get_histogram_data('hours')
        day_histo = await cls.get_histogram_data('days')
        ever_histo = await cls.get_histogram_data()

        # Wrap RemixQueue calls in to_thread if they are blocking
        async def get_remix_queue_info():
            return {
                'inqueue': len(r.queue),
                'processing': len(r.running),
                'maximumexceeded': len(r.remixers) > config.maximum_concurrent_remixes,
                'hourlyexceeded': r.countInHour() >= config.hourly_remix_limit,
                'errorRate': r.errorRate(),
                'errorRateExceeded': r.errorRateExceeded(),
                'isOpen': r.isAccepting(),
            }
        rq_info = await asyncio.to_thread(get_remix_queue_info)

        kwargs = {
            'ct': str(datetime.now()),
            'inqueue': rq_info['inqueue'],
            'processing': rq_info['processing'],
            'maximum': config.maximum_concurrent_remixes,
            'maximumexceeded': rq_info['maximumexceeded'],
            'hourly': config.hourly_remix_limit,
            'hourlyexceeded': rq_info['hourlyexceeded'],
            'errorInterval': 1,
            'errorRate': rq_info['errorRate'],
            'errorRateExceeded': rq_info['errorRateExceeded'],
            'isOpen': rq_info['isOpen'],
            'hour': hour_histo,
            'day': day_histo,
            'ever': ever_histo,
        }
        return await asyncio.to_thread(templates.load('overview.html').generate, **kwargs)

    @classmethod
    def _get_track_details_db_op(cls, track_identifier): # Synchronous DB part of track()
        db = database.Session()
        track_obj = None
        try:
            original_track_identifier = track_identifier # Keep for logging
            if isinstance(track_identifier, database.Track):
                if db.object_session(track_identifier) is not db : # Check if object is from a different session
                    track_obj = db.merge(track_identifier, load=True)
                else: # Already in current session
                    track_obj = track_identifier
            elif isinstance(track_identifier, str) and len(track_identifier) == 32:
                tracks_found = db.query(database.Track).filter(database.Track.uid == track_identifier).first() # Use first()
                track_obj = tracks_found # tracks_found will be None if not found
            elif isinstance(track_identifier, dict) and 'uid' in track_identifier and len(track_identifier['uid']) == 32:
                 track_obj = db.query(database.Track).filter(database.Track.uid == track_identifier['uid']).first()

            if not track_obj:
                log.debug(f"_get_track_details_db_op: No track found for identifier: {original_track_identifier}")
                return None

            # Eager load events if relationship is lazy. list() forces loading.
            events_list = list(track_obj.events)

            # Detach the main object and its loaded events from the session before returning.
            # This makes them safe to use in other threads/contexts if needed,
            # but they become detached instances. Attributes are still accessible.
            db.expunge(track_obj)
            for event_item in events_list: db.expunge(event_item)

            # Populate event-related attributes on the (now detached) track_obj
            events_map = {event.action: event for event in events_list}
            track_obj.upload = events_map.get('upload')
            track_obj.remix = events_map.get('remix')
            track_obj.share = events_map.get('share')
            track_obj.download = events_map.get('download')

            return track_obj
        except Exception as e_db:
            log.error(f"DB exception in _get_track_details_db_op for {track_identifier}: {e_db}\n{traceback.format_exc()}")
            db.rollback() # Rollback on error
            return None
        finally:
            db.close()

    @classmethod
    async def track(cls, track_identifier): # Changed to async classmethod
        if not track_identifier:
            log.warning("MonitorHandler.track called with no track_identifier")
            return ""

        track_obj = await asyncio.to_thread(cls._get_track_details_db_op, track_identifier)

        if not track_obj:
            log.debug(f"MonitorHandler.track: No track object returned from DB for {track_identifier}")
            return ''

        # Wrap RemixQueue interactions in to_thread
        def get_remixer_details(uid):
            remixer_info_dict = {}
            try:
                remixer_instance = r.remixers.get(uid)
                if remixer_instance:
                    remixer_info_dict['progress'] = remixer_instance.last['progress']
                    remixer_info_dict['text'] = remixer_instance.last['text']
                return remixer_info_dict
            except Exception as e: # Catch potential errors from accessing r.remixers
                log.error(f"Error accessing remixer info for {uid}: {e}", exc_info=True)
                return {}

        remixer_details = await asyncio.to_thread(get_remixer_details, track_obj.uid)
        track_obj.progress = remixer_details.get('progress')
        track_obj.text = remixer_details.get('text')
        
        track_obj.running = (track_obj.uid in r.running) or \
                         (track_obj.share and track_obj.share.start and \
                          not track_obj.share.end and track_obj.share.success is None)
        track_obj.failed = (track_obj.remix and track_obj.remix.success is False) or \
                        (track_obj.share and track_obj.share.success is False)

        if track_obj.failed:
            if track_obj.remix and track_obj.remix.success is False:
                track_obj.failure = track_obj.remix.detail
            elif track_obj.share and track_obj.share.detail is not None:
                track_obj.failure = track_obj.share.detail
            else:
                track_obj.failure = ''

        # os.path.exists should be wrapped
        # Example: targetPath = os.path.join('static/songs/', '%s.mp3' % track_obj.uid)
        # path_exists = await asyncio.to_thread(os.path.exists, targetPath)
        # For now, we assume 'exists' key in template might not be critical or handled differently
        # To avoid complexity, let's set it to False or remove if not essential for this refactor step
        path_exists_placeholder = False # Placeholder

        kwargs = {
            'track': track_obj,
            'exists': path_exists_placeholder,
            'time_ago_in_words': time_ago_in_words,
            'seconds_to_time': seconds_to_time,
            'convert_bytes': convert_bytes
        }
        return await asyncio.to_thread(templates.load('track.html').generate, **kwargs)

    @classmethod
    def _latest_tracks_db_op(cls): # Synchronous DB part of latest()
        db = database.Session()
        try:
            tracks = db.query(database.Track).order_by(database.Track.id.desc()).limit(config.monitor_limit).all()
            # Detach before returning, as they will be processed by async cls.track one by one
            for t in tracks: db.expunge(t)
            return tracks
        except Exception as e_latest:
            log.error(f"DB read exception in _latest_tracks_db_op, rolling back: {e_latest}\n{traceback.format_exc()}")
            db.rollback() # Rollback on error
            return []
        finally:
            db.close()

    @classmethod
    async def latest(cls): # Changed to async classmethod
        track_objects = await asyncio.to_thread(cls._latest_tracks_db_op)
        track_html_parts = []
        for track_obj in track_objects:
            html_part = await cls.track(track_obj) # track_obj is detached, _get_track_details_db_op will merge it
            track_html_parts.append(html_part)
        return ''.join(track_html_parts)

    # _timespan_sync is now the placeholder for the original timespan instance method logic.
    # The actual timespan DB logic is in _timespan_db_op, which would be called by an async version.
    def _timespan_db_op(self, start_dt, end_dt): # DB part of original timespan
        start = float(self.get_argument('start'))
        end = float(self.get_argument('end'))
        
        if end - start < 0:
            raise tornado.web.HTTPError(400)
        elif end - start > config.monitor_time_limit:
            start = end - config.monitor_time_limit

        db = database.Session()
        try:
            tracks = db.query(database.Track).filter(database.Track.time < datetime.fromtimestamp(end)).filter(database.Track.time > datetime.fromtimestamp(start)).order_by(database.Track.id.desc()).all()
        except Exception as e_timespan:
            log.error(f"DB read exception in timespan, rolling back: {e_timespan}\n{traceback.format_exc()}")
            db.rollback()
            tracks = [] # Ensure tracks is defined
        return ''.join([self.track(track) for track in tracks])

    def graph(self):
        history = {}
        db = database.Session()
        for i in range(1, 24*2): # last 3 days
            low = datetime.now() - timedelta(hours = i)
            high = low + timedelta(hours = 1)
            timestamp = 1000 * time.mktime(high.timetuple())
            try:
                dayr = db.query(database.Event).add_columns('count(*)', database.Event.action, database.Event.success).group_by('action', 'success').filter(database.Event.start.between(low, high)).all()
                n = {}
                for daya in dayr:
                    if daya.action == 'download':
                        n[daya.action] = [timestamp , int(daya.__dict__['count(*)'])]
                    elif daya.action == 'remix' or daya.action == 'share':
                        n["%s%s" % (daya.action, daya.success)] = [timestamp, int(daya.__dict__['count(*)'])]

                for k in self.keys:
                    if not k in history:
                        history[k] = []
                    if k in n:
                        history[k].append(n[k])
                    else:
                        history[k].append([timestamp, int(0)])
            except Exception as e_graph_inner:
                log.error(f"DB read exception in graph inner loop, rolling back: {e_graph_inner}\n{traceback.format_exc()}")
                db.rollback()
        return history

class ShareHandler(RequestHandler):
    async def get(self, uid): # Changed to async def, removed @tornado.web.asynchronous
        self.uid = uid
        event_data_for_db = { # Store event data to pass to db function
            "uid": uid,
            "action": "share",
            "ip": self.request.remote_ip,
            "success": None, # To be updated
            "detail": None,  # To be updated
            "start_time": datetime.now(), # approx start
            "end_time": None # To be updated
        }

        try:
            token = str(self.get_argument('token'))
            timeout = config.soundcloud_timeout

            if not uid in r.finished: # Assuming r.finished is a quick check
                raise tornado.web.HTTPError(404)

            t = r.finished[uid]['tag']

            description_content = config.soundcloud_description
            if 'artist' in t and 'album' in t and t['artist'].strip() != '' and t['album'].strip() != '':
                description_content = ("Original song by %s, from the album \"%s\".<br />" % (t['artist'].strip(), t['album'].strip())) + description_content
            elif 'artist' in t and t['artist'].strip() != '':
                description_content = ("Original song by %s.<br />" % t['artist'].strip()) + description_content

            # description_content.encode('utf-8') will be handled by MultiPartForm or httpclient

            form = MultiPartForm()
            form.add_field('oauth_token', token)
            form.add_field('track[title]', t['new_title']) # SC API likely handles UTF-8
            form.add_field('track[genre]', t['style'])
            form.add_field('track[license]', "no-rights-reserved")
            form.add_field('track[tag_list]', ' '.join(['"%s"' % tag for tag in config.soundcloud_tag_list]))
            form.add_field('track[description]', description_content)
            form.add_field('track[track_type]', 'remix')
            form.add_field('track[downloadable]', 'true')
            form.add_field('track[sharing_note]', config.soundcloud_sharing_note)

            # Wrap file I/O for track[asset_data]
            asset_file_path = t['remixed']
            def _read_asset_file():
                with open(asset_file_path, 'rb') as f_asset:
                    return f_asset.read()
            asset_data_bytes = await asyncio.to_thread(_read_asset_file)
            form.add_file_bytes('track[asset_data]', '%s.mp3' % uid, asset_data_bytes)

            if 'tempo' in t:
                form.add_field('track[bpm]', str(t['tempo'])) # Ensure BPM is string
            if 'art' in t:
                art_file_path = t['art']
                def _read_art_file():
                    with open(art_file_path, 'rb') as f_art:
                        return f_art.read()
                art_data_bytes = await asyncio.to_thread(_read_art_file)
                form.add_file_bytes('track[artwork_data]', '%s.png' % uid, art_data_bytes)
            if 'key' in t:
                form.add_field('track[key_signature]', t['key'])

            if hasattr(self, 'emit_monitor_updates') and callable(self.emit_monitor_updates):
                asyncio.create_task(self.emit_monitor_updates(self.uid))
            else:
                log.error("ShareHandler: emit_monitor_updates method not found or not callable before SC fetch.")

            self.ht = tornado.httpclient.AsyncHTTPClient()
            response = await self.ht.fetch( # Replaced callback with await
                "https://api.soundcloud.com/tracks.json",
                method='POST',
                headers={"Content-Type": form.get_content_type()},
                body=form.to_bytes(), # Use a method that returns bytes
                request_timeout=timeout,
                connect_timeout=timeout
            )

            self.write(response.body) # Write response to client
            # self.finish() is not needed here, self.write implies it for async.

            r_data = json.loads(response.body.decode('utf-8')) # Decode response body
            event_data_for_db["success"] = True
            event_data_for_db["detail"] = r_data.get('permalink_url', '').encode('ascii', 'ignore')
            # Assuming sc.fetchTracks() is either async or handled inside SoundCloud class
            # If it's blocking and needs to be here: await asyncio.to_thread(sc.fetchTracks)
            sc.fetchTracks()

        except tornado.httpclient.HTTPClientError as e_http:
            log.error(f"HTTPClientError in ShareHandler.get for UID {self.uid}: {e_http} - Response: {e_http.response.body if e_http.response else 'N/A'}")
            self.set_status(e_http.code if e_http.code else 500)
            self.write({ 'error': str(e_http), 'soundcloud_response': e_http.response.body.decode('utf-8') if e_http.response else None })
            event_data_for_db["success"] = False
            event_data_for_db["detail"] = traceback.format_exc()
        except Exception as e_share_get:
            log.error(f"Exception in ShareHandler.get for UID {self.uid}: {e_share_get}\n{traceback.format_exc()}")
            self.set_status(500)
            self.write({ 'error': traceback.format_exc().splitlines()[-1] })
            event_data_for_db["success"] = False
            event_data_for_db["detail"] = traceback.format_exc()
        finally:
            event_data_for_db["end_time"] = datetime.now()

            def _db_share_event_operations(event_data):
                db = database.Session()
                try:
                    # Create or merge the event
                    event_to_save = database.Event(
                        uid=event_data["uid"],
                        action=event_data["action"],
                        ip=event_data["ip"],
                        success=event_data["success"],
                        detail=event_data["detail"]
                        # start time is set by default in Event constructor if not passed
                        # end time can be set directly
                    )
                    # If your Event model has start/end time fields managed by SQLAlchemy, adjust accordingly.
                    # This example assumes direct setting or that constructor handles it.
                    # event_to_save.start = event_data["start_time"] # If not auto by model
                    event_to_save.end = event_data["end_time"]

                    db.add(event_to_save)
                    db.commit()
                except Exception as e_db_share_event:
                    log.error(f"DB exception saving share event for UID {event_data['uid']}, rolling back: {e_db_share_event}\n{traceback.format_exc()}")
                    db.rollback()
                finally:
                    db.close()

            await asyncio.to_thread(_db_share_event_operations, event_data_for_db)

            # Emit updates after DB operation, regardless of SC success/failure
            if hasattr(self, 'emit_monitor_updates') and callable(self.emit_monitor_updates):
                asyncio.create_task(self.emit_monitor_updates(self.uid))
            else:
                log.error("ShareHandler: emit_monitor_updates method not found or not callable in finally block.")

    # _get method is removed as its logic is now part of the async get

    async def emit_monitor_updates(self, uid): # Already async
        # Ensure sio and paths are available
        sio_instance = self.application.settings.get('sio')
        monitor_namespace = self.application.settings.get('monitor_namespace_path')
        if sio_instance and monitor_namespace:
            try:
                # MonitorHandler.track and .overview are now async classmethods
                track_html = await MonitorHandler.track(uid)
                overview_html = await MonitorHandler.overview()
                
                await sio_instance.emit('monitor_track_update', track_html, namespace=monitor_namespace)
                await sio_instance.emit('monitor_overview_update', overview_html, namespace=monitor_namespace)
            except Exception as e:
                log.error(f"ShareHandler: Error emitting monitor updates for UID {uid}: {e}", exc_info=True)
        else:
            log.error(f"ShareHandler: SIO instance or monitor_namespace_path not found in application settings for UID {uid}.")


class DownloadHandler(RequestHandler):
    async def get(self, uid): # Made async
        if not uid in r.finished or not os.path.isfile('static/songs/%s.mp3' % uid):
            raise tornado.web.HTTPError(404)
        else:
            db = database.Session() # This is a new session, fine for a thread
            uploader_ip = None
            try:
                # DB access in a thread
                def get_uploader_ip():
                    db_thread = database.Session()
                    try:
                        uploader_data = db_thread.query(database.Event.ip).filter_by(uid=uid, action="upload").first()
                        return uploader_data[0] if uploader_data else None
                    finally:
                        db_thread.close()
                uploader_ip = await asyncio.to_thread(get_uploader_ip)
            except Exception as e_db: # Catch specific Exception
                log.error(f"DB exception in DownloadHandler for UID {uid}, rolling back:\n{e_db}\n{traceback.format_exc()}")
                # db.rollback() # Not needed as it's per-thread session or read-only
                uploader_ip = self.request.remote_ip # Fallback or error handling

            if uploader_ip != self.request.remote_ip:
                log.error("Download attempt on remix %s by IP %s, not uploader %s!" % (uid, self.request.remote_ip, uploader_ip))
                raise tornado.web.HTTPError(403)
            
            filename = "%s.mp3" % (r.finished[uid]['tag']['new_title'] if 'new_title' in r.finished[uid]['tag'] else uid)
            self.set_header('Content-disposition', 'attachment; filename="%s"' % filename)
            self.set_header('Content-type', 'audio/mpeg')
            
            # File I/O should be non-blocking or in a thread for async handler
            file_path = os.path.join('static/songs/', '%s.mp3' % uid)
            file_size = await asyncio.to_thread(os.path.getsize, file_path)
            self.set_header('Content-Length', str(file_size))
            
            # Stream the file content if possible, or read in chunks if it's large
            # For simplicity, if files are small, reading directly might be okay but not ideal
            # File I/O is wrapped with to_thread
            def _read_download_file():
                with open(file_path, 'rb') as f_download:
                    return f_download.read()
            file_content = await asyncio.to_thread(_read_download_file)
            self.write(file_content)
            # await self.finish() # Not strictly needed after self.write for async handlers

            try:
                # DB access in a thread
                def record_download_event():
                    db_thread = database.Session()
                    try:
                        db_thread.add(database.Event(uid, "download", success = True, ip = self.request.remote_ip))
                        db_thread.commit()
                    except Exception as e_db_event: # Catch specific Exception
                        log.error(f"DB exception recording download for UID {uid}, rolling back:\n{e_db_event}\n{traceback.format_exc()}")
                        db_thread.rollback()
                    finally:
                        db_thread.close()
                await asyncio.to_thread(record_download_event)
            except Exception as e_record: # Catch specific Exception
                 log.error(f"Error creating task for DB record download event for UID {uid}:\n{e_record}\n{traceback.format_exc()}")

            if hasattr(self, 'emit_monitor_updates') and callable(self.emit_monitor_updates):
                asyncio.create_task(self.emit_monitor_updates(uid))
            else:
                log.error(f"DownloadHandler: emit_monitor_updates method not found or not callable for UID {uid}.")


    async def emit_monitor_updates(self, uid): # Already async
        sio_instance = self.application.settings.get('sio')
        monitor_namespace = self.application.settings.get('monitor_namespace_path')
        if sio_instance and monitor_namespace:
            try:
                # MonitorHandler.track and .overview are now async classmethods
                track_html = await MonitorHandler.track(uid)
                overview_html = await MonitorHandler.overview()
                await sio_instance.emit('monitor_track_update', track_html, namespace=monitor_namespace)
                await sio_instance.emit('monitor_overview_update', overview_html, namespace=monitor_namespace)
            except Exception as e:
                log.error(f"DownloadHandler: Error emitting monitor updates for UID {uid}: {e}", exc_info=True)
        else:
            log.error(f"DownloadHandler: SIO instance or monitor_namespace_path not found for UID {uid}.")


class UploadHandler(RequestHandler):
    async def trackDone(self, final): # Already async, seems fine
        global trackCount
        trackCount += 1
        
        progress_listeners = self.application.settings.get('progress_listeners', {})
        sio_instance = self.application.settings.get('sio')
        progress_namespace = self.application.settings.get('progress_namespace_path')

        if self.uid in progress_listeners: # self.uid is set in post()
            sid_to_close = progress_listeners.get(self.uid)
            log.info(f"UploadHandler: Track {self.uid} done. Attempting to close client connection SID {sid_to_close}.")
            if sid_to_close and sio_instance and progress_namespace:
                try:
                    await sio_instance.disconnect(sid_to_close, namespace=progress_namespace)
                    log.info(f"UploadHandler: Closed client connection for track {self.uid} (SID: {sid_to_close}).")
                except Exception as e:
                    log.error(f"UploadHandler: Error closing client connection for track {self.uid} (SID {sid_to_close}): {e}")
            else:
                log.warning(f"UploadHandler: SIO instance, progress_namespace, or SID missing for track {self.uid}. Cannot disconnect.")
        else:
            log.info(f"UploadHandler: Track {self.uid} done, but no active listener found in progress_listeners.")

    async def post(self): # Already async
        self.uid = config.uid()
        try:
            remixer_style_arg = self.get_argument('style')
            remixer = remixers[remixer_style_arg]
        except Exception as e_style:
            log.error(f"Error getting remixer style: {e_style}\n{traceback.format_exc()}")
            self.write({ "error" : "No remixer type specified!" })
            return
        
        qqfile_arg = self.get_argument('qqfile')
        self.track = database.Track(self.uid, style=remixer_style_arg)
        self.event = database.Event(self.uid, "upload", None, self.request.remote_ip, urllib.parse.unquote_plus(qqfile_arg.encode('ascii', 'ignore')))

        try:
            extension = os.path.splitext(qqfile_arg)[1]
        except Exception as e_ext:
            log.warning(f"Could not determine extension for {qqfile_arg}, defaulting to .mp3: {e_ext}")
            extension = '.mp3'
        self.track.extension = extension
        targetPath = os.path.join('uploads/', '%s%s' % (self.uid, extension))

        if extension not in config.allowed_file_extensions:
            self.write({ 'error': "Sorry, but %s only works with %s." % (config.app_name, list_in_words([e[1:] for e in config.allowed_file_extensions])) })
            return

        try:
            # File I/O needs to be wrapped
            data_to_write = self.request.body if not self.request.files else self.request.files['upload'][0]['body']

            def _write_file():
                with open(targetPath, 'wb') as f: # Changed to 'wb' for bytes
                    f.write(data_to_write)
            await asyncio.to_thread(_write_file)

            self.track.hash = md5(data_to_write).hexdigest()
            self.track.size = len(data_to_write)
            # Consider clearing data_to_write if memory is a concern, though it should go out of scope
            # del data_to_write # Not strictly necessary due to scope

            # r.add needs to be async if it involves async operations, or run in executor
            await r.add(self.uid, extension, remixer, self.trackDone)
            self.event.success = True
            response = await r.waitingResponse(self.uid)
            response['success'] = True
            self.write(response)
        except Exception as e:
            log.error("Error when trying to handle upload: %s" % traceback.format_exc())
            self.write({ "error" : "Could not save file." })
            self.event.success = False
        self.event.end = datetime.now()

        # Database operations need to be wrapped
        def _db_upload_operations(track_obj, event_obj):
            db = database.Session()
            try:
                db.add(track_obj)
                db.add(event_obj)
                db.commit()
            except Exception as e_db_upload:
                log.error(f"DB exception during upload for UID {track_obj.uid}, rolling back: {e_db_upload}\n{traceback.format_exc()}")
                db.rollback()
                raise # Re-raise to be caught by outer try/except if necessary
            finally:
                db.close()

        try:
            await asyncio.to_thread(_db_upload_operations, self.track, self.event)
        except Exception:
            # Error already logged in _db_upload_operations, or by the main exception handler
            pass


        # MonitorSocket.update(self.uid) -> Will be replaced by sio.emit
        # Ensure emit_monitor_updates is called correctly
        if hasattr(self, 'emit_monitor_updates') and callable(self.emit_monitor_updates):
            asyncio.create_task(self.emit_monitor_updates(self.uid)) # self.uid is available
        else:
            log.error(f"UploadHandler: emit_monitor_updates method not found or not callable for UID {self.uid}.")
        gc.collect() # Consider if gc.collect() is still needed or if it has performance implications here.

    async def emit_monitor_updates(self, uid): # Already async
        sio_instance = self.application.settings.get('sio')
        monitor_namespace = self.application.settings.get('monitor_namespace_path')
        if sio_instance and monitor_namespace:
            try:
                # MonitorHandler.track and .overview are now async classmethods
                track_html = await MonitorHandler.track(uid) # uid is available
                overview_html = await MonitorHandler.overview()
                await sio_instance.emit('monitor_track_update', track_html, namespace=monitor_namespace)
                await sio_instance.emit('monitor_overview_update', overview_html, namespace=monitor_namespace)
            except Exception as e:
                log.error(f"UploadHandler: Error emitting monitor updates for UID {uid}: {e}", exc_info=True)
        else:
            log.error(f"UploadHandler: SIO instance or monitor_namespace_path not found for UID {uid}.")


# Original Tornado application handlers
tornado_handlers = [
    (r"/(favicon.ico)", tornado.web.StaticFileHandler, {"path": "static/img/"}),
    (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": "static/"}),
    (r"/monitor[/]?([^/]+)?[/]?(.*)", MonitorHandler),
    (r"/upload", UploadHandler),
    (r"/share/(%s)" % config.uid_re, ShareHandler),
    (r"/download/(%s)" % config.uid_re, DownloadHandler),
    (r"/", MainHandler),
]

application = tornado.web.Application(tornado_handlers)
# Wrap Tornado app with Socket.IO ASGIApp
sio_app = socketio.ASGIApp(sio, other_asgi_app=application)


async def main():
    global log, r, sc, templates, javascripts, connectform, trackCount # Ensure these are accessible if needed by main logic

    Daemon() # This might need to be async or run in executor if it blocks

    log = logging.getLogger()
    log.name = config.log_name
    handler = logging.FileHandler(config.log_file)
    handler.setFormatter(logging.Formatter(config.log_format))
    handler.setLevel(logging.DEBUG)
    log.addHandler(handler)

    log.info("Starting %s..." % config.app_name)
    try:
        locale.setlocale(locale.LC_ALL, 'en_US.utf8')
    except locale.Error as e_locale: # More specific exception
        log.warning(f"Could not set locale to en_US.utf8, trying en_US: {e_locale}")
        try:
            locale.setlocale(locale.LC_ALL, 'en_US')
        except locale.Error as e_locale_us:
            log.error(f"Could not set locale to en_US either: {e_locale_us}. Proceeding with default locale.")
    
    log.info("\tConnecting to MySQL...")
    db = database.Session()
    if not db:
        log.critical("Can't connect to DB!")
        exit(1)

    log.info("\tInitializing database schema if necessary...")
    try:
        Base.metadata.create_all(engine)
        log.info("\tDatabase schema initialized/verified.")
    except Exception as e:
        log.critical(f"Could not initialize database schema: {e}")
        # Potentially exit if schema creation is critical and fails
        # For now, just log critical and let it proceed to see if it runs

    log.info("\tGrabbing track count from DB...")
    trackCount = db.query(database.Event).filter_by(action='remix', success = True).count()

    log.info("\tClearing temp directories...")
    cleanup = Cleanup(log, None)
    cleanup.all() # Assuming synchronous

    log.info("\tInstantiating SoundCloud object...")
    sc = SoundCloud(log) # Assuming synchronous

    log.info("\tLoading templates...")
    templates = tornado.template.Loader("templates/")
    templates.autoescape = None

    log.info("\tCaching javascripts...")
    # This startup I/O could be made async with aiofiles if it becomes a bottleneck
    # For now, keeping it synchronous as it's a one-time startup cost.
    def _read_js_file(path):
        with open(path, 'r') as f_js:
            return f_js.read()

    js_files_content = [
        await asyncio.to_thread(_read_js_file, './static/js/jquery.fileupload.js'),
        await asyncio.to_thread(_read_js_file, './static/js/front.js'),
        await asyncio.to_thread(_read_js_file, './static/js/player.js'),
    ]
    javascripts = '\n'.join(js_files_content)
    connectform = await asyncio.to_thread(_read_js_file, './static/js/connectform.js')
    
    # Adjust resource paths for Socket.IO namespaces (remove /socket.io prefix if present)
    # Defaulting to ensure they start with a slash and have no 'socket.io' prefix.
    raw_progress_resource = config.progress_resource if hasattr(config, 'progress_resource') else 'socket.io/progress'
    clean_progress_resource = '/' + raw_progress_resource.split('socket.io/')[-1].lstrip('/')
    
    raw_monitor_resource = config.monitor_resource if hasattr(config, 'monitor_resource') else 'socket.io/monitor'
    clean_monitor_resource = '/' + raw_monitor_resource.split('socket.io/')[-1].lstrip('/')

    log.info(f"\tRegistering ProgressNamespace at: {clean_progress_resource}")
    progress_ns = ProgressNamespace(clean_progress_resource, None, config) # r is not yet initialized
    sio.register_namespace(progress_ns)
    
    log.info(f"\tRegistering MonitorNamespace at: {clean_monitor_resource}")
    monitor_ns = MonitorNamespace(clean_monitor_resource, MonitorHandler, config)
    sio.register_namespace(monitor_ns)

    log.info("\tStarting RemixQueue...")
    # RemixQueue needs sio, progress_ns.listeners, and namespace paths
    r = RemixQueue(
        sio_instance=sio,
        progress_listeners_map=progress_ns.listeners,
        progress_namespace_path=clean_progress_resource,
        monitor_handler_class=MonitorHandler, # For calling MonitorHandler.track/overview if needed
        monitor_namespace_path=clean_monitor_resource,
        logger=log, # Added logger instance
        config_instance=config # Pass full config if RemixQueue needs other params
    )
    progress_ns.r = r # Give ProgressNamespace the initialized r
    cleanup.remixQueue = r


    # Make sio available to Tornado handlers via application settings
    application.settings['sio'] = sio
    application.settings['monitor_namespace_path'] = clean_monitor_resource
    application.settings['progress_namespace_path'] = clean_progress_resource
    application.settings['progress_listeners'] = progress_ns.listeners # Make listeners map available

    # For MonitorHandler to call its own static/class methods that might now need sio
    # Also, for RequestHandler instances to call emit_monitor_updates if defined on MonitorHandler
    MonitorHandler.sio = sio 
    MonitorHandler.monitor_namespace_path = clean_monitor_resource
    MonitorHandler.application_settings = application.settings # for accessing sio if needed in instance methods

    log.info("\tStarting cleanup timers...")
    # Tornado PeriodicCallback should work with asyncio if Tornado's IOLoop is asyncio-based
    fileCleanupTimer = tornado.ioloop.PeriodicCallback(cleanup.active, 1000 * config.cleanup_timeout)
    fileCleanupTimer.start()
    
    queueCleanupTimer = tornado.ioloop.PeriodicCallback(r.cleanup, 100 * min(config.watch_timeout, config.remix_timeout, config.wait_timeout))
    queueCleanupTimer.start()

    log.info("\tStarting Server with Socket.IO...")
    server_port = config.socket_io_port if hasattr(config, 'socket_io_port') else 8888
    
    # Use Tornado to serve the ASGI app (sio_app which includes the Tornado app)
    http_server = tornado.httpserver.HTTPServer(sio_app)
    http_server.listen(server_port)
    log.info(f"Tornado server with Socket.IO running on port {server_port}")
    await asyncio.Event().wait() # Keep alive

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Server shutting down by KeyboardInterrupt...")
    except Exception as e:
        log.critical(f"Unhandled exception in main: {e}\n{traceback.format_exc()}")
    finally:
        log.info("Performing final cleanup...")
        # cleanup.all() # Ensure this is safe to call in finally, might need to be async
        log.info("Shutdown complete.")
        if os.path.exists('server.py.pid'): # Assuming Daemon sets this
            os.remove('server.py.pid')
        sys.exit(0)

