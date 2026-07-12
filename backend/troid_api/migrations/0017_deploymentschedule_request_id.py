from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('troid_api', '0016_alter_request_requested_by_role_alter_request_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='deploymentschedule',
            name='request_id',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]
