"""
    The Wub Machine
    Python web interface
    started August 5 2011 by Peter Sobot (petersobot.com)
"""

__author__ = "Peter Sobot"
__copyright__ = "Copyright (C) 2011 Peter Sobot"
__version__ = "2.2"

import json, time, locale, traceback, gc, logging, os, database, urllib.parse
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
    def get(self):
        js = ("window.wubconfig = %s;" % json.dumps(config.javascript)) + javascripts
        kwargs = {
            "isOpen": r.isAccepting(),
            "track": sc.frontPageTrack(),
            "isErroring": r.errorRateExceeded(),
            'count': locale.format_string("%d", trackCount, grouping=True),
            'cleanup_timeout': time_in_words(config.cleanup_timeout),
            'javascript': js,
            'connectform': connectform
        }
            self.write(templates.load('index.html').generate(**kwargs))
    def head(self):
        self.finish()

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
        # Optionally, send initial overview or latest tracks
        try:
            overview_data = self.MonitorHandler.overview() # Assuming overview is classmethod or static
            latest_data_html = self.MonitorHandler.latest(self.MonitorHandler) # latest needs a self, passing class
            await sio.emit('monitor_overview_update', overview_data, room=sid, namespace=self.namespace)
            await sio.emit('monitor_latest_update', latest_data_html, room=sid, namespace=self.namespace)

        except Exception as e:
            log.error(f"Error sending initial data to monitor {sid}: {e}")


    async def on_disconnect(self, sid):
        log.info(f"MonitorNamespace: Client {sid} disconnected")

    # Methods for broadcasting updates will be called from MonitorHandler or other parts of the app
    # using the `sio` instance directly.

class MonitorHandler(RequestHandler):
    keys = ['upload', 'download', 'remixTrue', 'remixFalse', 'shareTrue', 'shareFalse']

    @tornado.web.asynchronous
    def get(self, sub=None, uid=None):
        if sub:
            sections = {
                'graph': self.graph,
                'overview': self.overview,
                'latest': self.latest,
                'remixqueue': self.remixqueue,
                'timespan' : self.timespan
            }
            if sub in sections:
                self.write(sections[sub]())
                self.finish()
            else:
                raise tornado.web.HTTPError(404)
        else:
            kwargs = {
                'overview': self.overview(),
                'latest': self.latest(),
                'config': "window.wubconfig = %s;" % json.dumps(config.javascript)
            }
            self.write(templates.load('monitor.html').generate(**kwargs))
            self.finish()

    def clearqueue(self):
        del self.watchqueue[:]

    @classmethod
    def histogram(self, interval=None):
        db = database.Session()
        try:
            query = db.query(database.Event).add_columns('count(*)', database.Event.action, database.Event.success).group_by('action', 'success')
            if interval:
                limit = datetime.now() - timedelta(**{ interval: 1 })
                d = query.filter(database.Event.start > limit).all()
            else:
                d = query.all()
            n = {}
            for k in self.keys:
                n[k] = 0
            for a in d:
                if a.action == 'upload' or a.action == 'download':
                    n[a.action] = int(a.__dict__['count(*)'])
                elif a.action == 'remix' or a.action == 'share':
                    n["%s%s" % (a.action, a.success)] = int(a.__dict__['count(*)'])
            return n
        except Exception as e_hist:
            log.error(f"DB read exception in histogram: {e_hist}\n{traceback.format_exc()}")
            return {}

    def remixqueue(self):
        self.set_header("Content-Type", 'text/plain')
        return str("Remixers: %s\nFinished: %s\nQueue:    %s\nRunning:  %s" % (r.remixers, r.finished, r.queue, r.running))

    @classmethod
    def overview(self):
        kwargs = {
            'ct': str(datetime.now()),
            'inqueue': len(r.queue),
            'processing': len(r.running),
            'maximum': config.maximum_concurrent_remixes,
            'maximumexceeded': len(r.remixers) > config.maximum_concurrent_remixes,
            'hourly': config.hourly_remix_limit,
            'hourlyexceeded': r.countInHour() >= config.hourly_remix_limit,
            'errorInterval': 1,
            'errorRate': r.errorRate(),
            'errorRateExceeded': r.errorRateExceeded(),
            'isOpen': r.isAccepting(),
            'hour': MonitorHandler.histogram('hours'),
            'day': MonitorHandler.histogram('days'),
            'ever': MonitorHandler.histogram(),
        }
        return templates.load('overview.html').generate(**kwargs)

    def current(self):
        running = [v for k, v in r.remixers.items() if k in r.running]
        return templates.load('current.html').generate(c=running)

    def shared(self):
        db = database.Session()
        try:
            d = db.query(database.Event).filter_by(action = "sharing", success = True).group_by(database.Event.uid).order_by(database.Event.id.desc()).limit(6).all()
        except Exception as e_shared:
            log.error(f"DB read exception in shared: {e_shared}\n{traceback.format_exc()}")
            d = [] # Ensure d is defined
        return templates.load('shared.html').generate(tracks=d)

    @classmethod
    def track(self, track):
        db = database.Session()

        if not track:
            raise tornado.web.HTTPError(400)

        if isinstance(track, database.Track):
            try:
                track = db.merge(track)
            except Exception as e_merge:
                log.error(f"DB merge exception in track: {e_merge}\n{traceback.format_exc()}")
                db.rollback()
        else:
            if isinstance(track, dict) and 'uid' in track:
                track = track['uid']
            elif not isinstance(track, str) or len(track) != 32:
                return ''
            try:
                tracks =  db.query(database.Track).filter(database.Track.uid == track).all()
            except Exception as e_query:
                log.error(f"DB query exception in track: {e_query}\n{traceback.format_exc()}")
                db.rollback()
                tracks = [] # Ensure tracks is defined
            if not tracks:
                return ''
            else:
                track = tracks[0]

        for stat in ['upload', 'remix', 'share', 'download']:
            track.__setattr__(stat, None)
        
        events = {}
        for event in track.events:
            events[event.action] = event
        track.upload = events.get('upload')
        track.remix = events.get('remix')
        track.share = events.get('share')
        track.download = events.get('download')
        track.running = track.uid in r.running or (track.share and track.share.start and not track.share.end and track.share.success is None)
        track.failed = (track.remix and track.remix.success == False) or (track.share and track.share.success == False)
        if track.failed:
            if track.remix.success is False:
                track.failure = track.remix.detail 
            elif track.share.detail is not None:
                track.failure = track.share.detail
            else:
                track.failure = ''
        try:
            track.progress = r.remixers[track.uid].last['progress']
            track.text = r.remixers[track.uid].last['text']
        except:
            track.progress = None
            track.text = None

        kwargs = {
            'track': track,
            'exists': os.path.exists,
            'time_ago_in_words': time_ago_in_words,
            'seconds_to_time': seconds_to_time,
            'convert_bytes': convert_bytes
        }
        return templates.load('track.html').generate(**kwargs)

    def latest(self):
        db = database.Session()
        try:
            tracks = db.query(database.Track).order_by(database.Track.id.desc()).limit(config.monitor_limit).all()
        except Exception as e_latest:
            log.error(f"DB read exception in latest, rolling back: {e_latest}\n{traceback.format_exc()}")
            db.rollback()
            tracks = [] # Ensure tracks is defined
        return ''.join([self.track(track) for track in tracks])

    def timespan(self):
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
    @tornado.web.asynchronous
    def get(self, uid):
        self.uid = uid
        try:
            token = str(self.get_argument('token'))
            timeout = config.soundcloud_timeout
            self.event = database.Event(uid, "share", ip = self.request.remote_ip) 

            if not uid in r.finished:
                raise tornado.web.HTTPError(404)

            t = r.finished[uid]['tag']

            description = config.soundcloud_description
            if 'artist' in t and 'album' in t and t['artist'].strip() != '' and t['album'].strip() != '':
                description = ("Original song by %s, from the album \"%s\".<br />" % (t['artist'].strip(), t['album'].strip())) + description
            elif 'artist' in t and t['artist'].strip() != '':
                description = ("Original song by %s.<br />" % t['artist'].strip()) + description

            form = MultiPartForm()
            form.add_field('oauth_token', token)
            form.add_field('track[title]', t['new_title'].encode('utf-8'))
            form.add_field('track[genre]', t['style'])
            form.add_field('track[license]', "no-rights-reserved")
            form.add_field('track[tag_list]', ' '.join(['"%s"' % tag for tag in config.soundcloud_tag_list]))
            form.add_field('track[description]', description.encode('utf-8'))
            form.add_field('track[track_type]', 'remix')
            form.add_field('track[downloadable]', 'true')
            form.add_field('track[sharing_note]', config.soundcloud_sharing_note)
            form.add_file('track[asset_data]', '%s.mp3' % uid, open(t['remixed']))

            if 'tempo' in t:
                form.add_field('track[bpm]', t['tempo'])
            if 'art' in t:
                form.add_file('track[artwork_data]', '%s.png' % uid, open(t['art']))
            if 'key' in t:
                form.add_field('track[key_signature]', t['key'])

            # MonitorSocket.update(self.uid) -> Will be replaced by sio.emit
            # Ensure emit_monitor_updates is called correctly
            if hasattr(self, 'emit_monitor_updates') and callable(self.emit_monitor_updates):
                asyncio.create_task(self.emit_monitor_updates(self.uid))
            else:
                log.error("ShareHandler: emit_monitor_updates method not found or not callable.")


            self.ht = tornado.httpclient.AsyncHTTPClient()
            self.ht.fetch(
                "https://api.soundcloud.com/tracks.json",
                self._get,
                method = 'POST',
                headers = {"Content-Type": form.get_content_type()},
                body = str(form),
                request_timeout = timeout,
                connect_timeout = timeout
            )
        except Exception as e_share_get:
            self.write({ 'error': traceback.format_exc().splitlines()[-1] })
            self.event.success = False
            self.event.end = datetime.now()
            self.event.detail = traceback.format_exc()
            log.error(f"Exception in ShareHandler.get for UID {self.uid}: {e_share_get}\n{self.event.detail}")
            # MonitorSocket.update(self.uid) -> Will be replaced by sio.emit
            if hasattr(self, 'emit_monitor_updates') and callable(self.emit_monitor_updates):
                asyncio.create_task(self.emit_monitor_updates(self.uid))
            else:
                log.error("ShareHandler: emit_monitor_updates method not found or not callable on error path.")
        finally:
            db = database.Session()
            try:
                db.add(self.event)
                db.commit()
            except Exception as e_db_share_event:
                log.error(f"DB exception saving share event for UID {self.uid}, rolling back: {e_db_share_event}\n{traceback.format_exc()}")
                db.rollback()
    
    def _get(self, response):
        self.write(response.body)
        self.finish()
        r_data = json.loads(response.body) # Renamed to avoid conflict with global 'r'
        try:
            db = database.Session()
            self.event = db.merge(self.event) # Ensure self.event was created in get()
            self.event.success = True
            self.event.end = datetime.now()
            self.event.detail = r_data['permalink_url'].encode('ascii', 'ignore')
            db.commit()
        except Exception as e_db_share_get:
            log.error(f"DB exception after SoundCloud share for UID {self.uid}, rolling back: {e_db_share_get}\n{traceback.format_exc()}")
            db.rollback()
        # MonitorSocket.update(self.uid) -> Will be replaced by sio.emit
        if hasattr(self, 'emit_monitor_updates') and callable(self.emit_monitor_updates):
            asyncio.create_task(self.emit_monitor_updates(self.uid))
        else:
            log.error("ShareHandler: emit_monitor_updates method not found or not callable after SC fetch.")
        sc.fetchTracks()

    async def emit_monitor_updates(self, uid):
        # Ensure sio and paths are available
        sio_instance = self.application.settings.get('sio')
        monitor_namespace = self.application.settings.get('monitor_namespace_path')
        if sio_instance and monitor_namespace:
            try:
                # MonitorHandler.track and .overview are classmethods, call them on the class
                # Run potentially blocking calls in a thread
                track_html = await asyncio.to_thread(MonitorHandler.track, uid)
                overview_html = await asyncio.to_thread(MonitorHandler.overview)
                
                await sio_instance.emit('monitor_track_update', track_html, namespace=monitor_namespace)
                await sio_instance.emit('monitor_overview_update', overview_html, namespace=monitor_namespace)
            except Exception as e:
                log.error(f"ShareHandler: Error emitting monitor updates for UID {uid}: {e}")
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
            with open(file_path, 'rb') as f:
                # For large files, this should be chunked and awaited
                file_content = await asyncio.to_thread(f.read)
            self.write(file_content)
            await self.finish() # Ensure finish is awaited for async handler

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


    async def emit_monitor_updates(self, uid):
        sio_instance = self.application.settings.get('sio')
        monitor_namespace = self.application.settings.get('monitor_namespace_path')
        if sio_instance and monitor_namespace:
            try:
                track_html = await asyncio.to_thread(MonitorHandler.track, uid)
                overview_html = await asyncio.to_thread(MonitorHandler.overview)
                await sio_instance.emit('monitor_track_update', track_html, namespace=monitor_namespace)
                await sio_instance.emit('monitor_overview_update', overview_html, namespace=monitor_namespace)
            except Exception as e:
                log.error(f"DownloadHandler: Error emitting monitor updates for UID {uid}: {e}")
        else:
            log.error(f"DownloadHandler: SIO instance or monitor_namespace_path not found for UID {uid}.")


class UploadHandler(RequestHandler):
    async def trackDone(self, final):
        global trackCount
        trackCount += 1
        
        progress_listeners = self.application.settings.get('progress_listeners', {})
        sio_instance = self.application.settings.get('sio')
        progress_namespace = self.application.settings.get('progress_namespace_path')

        if self.uid in progress_listeners:
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


    async def post(self):
        self.uid = config.uid()
        try:
            remixer = remixers[self.get_argument('style')]
        except Exception as e_style:
            log.error(f"Error getting remixer style: {e_style}\n{traceback.format_exc()}")
            self.write({ "error" : "No remixer type specified!" })
            return # Added return to stop processing
        
        self.track = database.Track(self.uid, style=self.get_argument('style'))
        self.event = database.Event(self.uid, "upload", None, self.request.remote_ip, urllib.parse.unquote_plus(self.get_argument('qqfile').encode('ascii', 'ignore')))

        try:
            extension = os.path.splitext(self.get_argument('qqfile'))[1]
        except Exception as e_ext:
            log.warning(f"Could not determine extension for {self.get_argument('qqfile')}, defaulting to .mp3: {e_ext}")
            extension = '.mp3'
        self.track.extension = extension
        targetPath = os.path.join('uploads/', '%s%s' % (self.uid, extension))

        if extension not in config.allowed_file_extensions:
            self.write({ 'error': "Sorry, but %s only works with %s." % (config.app_name, list_in_words([e[1:] for e in config.allowed_file_extensions])) })
            return

        try:
            f = open(targetPath, 'w')
            data = self.request.body if not self.request.files else self.request.files['upload'][0]['body'] 
            f.write(data)
            f.close()

            self.track.hash = md5(data).hexdigest()
            self.track.size = len(data)
            del data

            if not self.request.files:
                del self.request.body
            else:
                del self.request.files['upload'][0]['body']

            # r.add needs to be async if it involves async operations, or run in executor
            # The callback ProgressSocket.update is replaced by RemixQueue's own emit method
            # self.trackDone also needs to be async if it calls sio.disconnect
            await r.add(self.uid, extension, remixer, self.trackDone) # Removed ProgressSocket.update
            self.event.success = True
            response = await r.waitingResponse(self.uid) # Assuming waitingResponse might become async
            response['success'] = True
            self.write(response)
        except Exception as e:
            log.error("Error when trying to handle upload: %s" % traceback.format_exc())
            self.write({ "error" : "Could not save file." })
            self.event.success = False
        self.event.end = datetime.now()

        db = database.Session()
        try:
            db.add(self.track)
            db.add(self.event)
            db.commit()
        except Exception as e_db_upload:
            log.error(f"DB exception during upload for UID {self.uid}, rolling back: {e_db_upload}\n{traceback.format_exc()}")
            db.rollback()

        # MonitorSocket.update(self.uid) -> Will be replaced by sio.emit
            if hasattr(self, 'emit_monitor_updates') and callable(self.emit_monitor_updates):
                asyncio.create_task(self.emit_monitor_updates(self.uid))
            else:
                log.error(f"UploadHandler: emit_monitor_updates method not found or not callable for UID {self.uid}.")
        gc.collect()

    async def emit_monitor_updates(self, uid):
        sio_instance = self.application.settings.get('sio')
        monitor_namespace = self.application.settings.get('monitor_namespace_path')
        if sio_instance and monitor_namespace:
            try:
                track_html = await asyncio.to_thread(MonitorHandler.track, uid)
                overview_html = await asyncio.to_thread(MonitorHandler.overview)
                await sio_instance.emit('monitor_track_update', track_html, namespace=monitor_namespace)
                await sio_instance.emit('monitor_overview_update', overview_html, namespace=monitor_namespace)
            except Exception as e:
                log.error(f"UploadHandler: Error emitting monitor updates for UID {uid}: {e}")
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
    javascripts = '\n'.join([
        open('./static/js/jquery.fileupload.js').read(),
        open('./static/js/front.js').read(),
        open('./static/js/player.js').read(),
    ])
    connectform = open('./static/js/connectform.js').read()
    
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

