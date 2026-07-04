# Generated migration for Request model changes

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('troid_api', '0002_auditlog_heatmapdata_segregationrecord_user_operator_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='request',
            name='request_id',
            field=models.CharField(blank=True, max_length=20, unique=True),
        ),
        migrations.AlterField(
            model_name='request',
            name='request_type',
            field=models.CharField(default='Cleanup', max_length=50),
        ),
        migrations.AlterField(
            model_name='request',
            name='requested_by_name',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AlterField(
            model_name='request',
            name='requested_by_role',
            field=models.CharField(default='CENRO', max_length=50),
        ),
        migrations.AlterField(
            model_name='request',
            name='requested_by_barangay',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AlterField(
            model_name='request',
            name='contact',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AlterField(
            model_name='request',
            name='email',
            field=models.EmailField(blank=True, default='', max_length=254, null=True),
        ),
        migrations.AlterField(
            model_name='request',
            name='location_name',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AlterField(
            model_name='request',
            name='barangay',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AlterField(
            model_name='request',
            name='municipality',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AlterField(
            model_name='request',
            name='province',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]