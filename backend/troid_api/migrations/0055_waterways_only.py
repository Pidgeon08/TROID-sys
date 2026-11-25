# TROID works waterways (rivers, creeks, canals, ponds), not the coast or shoreline. Collection
# areas marked as coast become Other, and trash reports that gave a shoreline site no longer name
# a site type.
from django.db import migrations, models


def waterways_only(apps, schema_editor):
    apps.get_model('troid_api', 'CollectionArea').objects.filter(water_body_type='coast').update(water_body_type='other')
    apps.get_model('troid_api', 'Request').objects.filter(site_type='shoreline').update(site_type='')


class Migration(migrations.Migration):

    dependencies = [
        ('troid_api', '0054_retire_finished_statuses'),
    ]

    operations = [
        migrations.RunPython(waterways_only, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='collectionarea',
            name='water_body_type',
            field=models.CharField(blank=True, choices=[('river', 'River'), ('creek', 'Creek'), ('estuary', 'Estuary or river mouth'), ('canal', 'Drainage canal'), ('pond', 'Pond or lagoon'), ('other', 'Other')], default='', max_length=20),
        ),
        migrations.AlterField(
            model_name='request',
            name='site_type',
            field=models.CharField(blank=True, choices=[('river', 'River, stream or tributary'), ('lake', 'Lake or pond')], default='', max_length=20),
        ),
    ]
