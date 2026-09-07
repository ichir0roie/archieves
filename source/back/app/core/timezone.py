from datetime import timedelta, timezone

# The app has no multi-timezone requirement yet; everything is recorded and
# displayed in Japan Standard Time. JST has no DST, so a fixed offset is exact.
JST = timezone(timedelta(hours=9), name="JST")
