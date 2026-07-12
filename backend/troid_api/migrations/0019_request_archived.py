from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('troid_api', '0018_alter_deploymentschedule_day'),
    ]

    operations = [
        migrations.AddField(
            model_name='request',
            name='archived',
            field=models.BooleanField(default=False),
        ),
    ]
