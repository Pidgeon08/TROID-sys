from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('troid_api', '0017_deploymentschedule_request_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='deploymentschedule',
            name='day',
            field=models.CharField(max_length=20),
        ),
    ]
