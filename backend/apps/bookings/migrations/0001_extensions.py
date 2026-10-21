from django.contrib.postgres.operations import BtreeGistExtension
from django.db import migrations


class Migration(migrations.Migration):
    """btree_gist: cho phép EXCLUDE USING gist (room_id WITH =, period WITH &&)."""
    initial = True
    dependencies = []
    operations = [BtreeGistExtension()]
