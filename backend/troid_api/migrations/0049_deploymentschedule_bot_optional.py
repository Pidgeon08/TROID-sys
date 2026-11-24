from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """Unsupported (manual) cleanups are scheduled without a bot."""

    dependencies = [
        ('troid_api', '0048_system_pause'),
    ]

    operations = [
        migrations.AlterField(
            model_name='deploymentschedule',
            name='bot',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='deployments', to='troid_api.boat'),
        ),
    ]
