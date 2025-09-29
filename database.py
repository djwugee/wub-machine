from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, scoped_session
from sqlalchemy.pool import QueuePool
from sqlalchemy import Column, Integer, CHAR, DateTime, String, ForeignKey, Boolean, Text, create_engine
import config, datetime

Base = declarative_base()

###
# Models
###

class Track(Base):
    __tablename__ = 'tracks'
    id = Column(Integer, primary_key=True)
    uid = Column(CHAR(length=32), index=True)
    time = Column(DateTime)
    hash = Column(CHAR(length=32))
    size = Column(Integer)
    style = Column(String(50))
    
    # Tag Attributes
    length = Column(Integer)
    samplerate = Column(Integer)
    channels = Column(Integer)
    extension = Column(String(10))
    bitrate = Column(Integer)

    title = Column(String(255))
    artist = Column(String(255))
    album = Column(String(255))
    
    art = Column(String(255))
    thumbnail = Column(String(255))
    
    events = relationship("Event")

    def __init__(self, uid, hash = None, size = None, style = None, length = None, samplerate = None, channels = None, extension = None, bitrate = None, title = None, artist = None, album = None, art = None, thumbnail = None):
        self.uid = uid
        self.time = datetime.datetime.now()
        
        self.hash = hash
        self.size = size
        self.style = style

        self.length = length
        self.samplerate = samplerate
        self.channels = channels
        self.extension = extension
        self.bitrate = bitrate

        self.title = title
        self.artist = artist
        self.album = album

        self.art = art
        self.thumbnail = thumbnail

class Event(Base):
    __tablename__ = 'events'
    id = Column(Integer, primary_key=True)
    uid = Column(CHAR(length=32) , ForeignKey('tracks.uid'))
    action = Column(String(50))
    start = Column(DateTime)
    end = Column(DateTime)
    success = Column(Boolean)
    ip = Column(String(50))
    detail = Column(Text)
    track = relationship("Track")

    def __init__(self, uid, action, success = None, ip = None, detail = None):
        self.uid = uid
        self.start = datetime.datetime.now()
        if success is not None:
            self.end = datetime.datetime.now()
        self.action = action
        self.success = success 
        self.ip = ip
        self.detail = detail

    def time(self):
        try:
            return self.end - self.start
        except:
            return datetime.timedelta(0)


###
# DB Connection Handling
###

engine = create_engine(
    config.database_connect_string,
    echo=config.echo_database_queries,
    poolclass=QueuePool,
    pool_recycle=10
)

# Create database if it does not exist.
from sqlalchemy.engine import url
from sqlalchemy import text
u = url.make_url(config.database_connect_string)
server_engine = create_engine(
    f"mysql+pymysql://{u.username}:{u.password}@{u.host}:{u.port or 3306}",
    pool_recycle=10
)
with server_engine.connect() as conn:
    conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {u.database}"))

Base.metadata.create_all(engine)
Session = scoped_session(sessionmaker(engine))
