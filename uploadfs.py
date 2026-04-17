from pathlib import Path
Import("env")

def upload_fs(source, target, env):
   fs_path = Path("data")
    if fs_path.exists():
        print("Uploading LittleFS filesystem...")
        env.Execute("pio run --target uploadfs")

env.AddPostAction("buildfs", upload_fs)