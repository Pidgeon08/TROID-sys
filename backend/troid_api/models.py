from django.db import models

class Boat(models.Model):
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    last_latitude = models.FloatField(null=True, blank=True)
    last_longitude = models.FloatField(null=True, blank=True)
    battery_level = models.FloatField(null=True, blank=True)
    last_seen = models.DateTimeField(auto_now=True)
    operator = models.ForeignKey('Operator', on_delete=models.SET_NULL, null=True, blank=True, related_name='boats')

    def __str__(self):
        return self.name

class DetectionEvent(models.Model):
    boat = models.ForeignKey(Boat, on_delete=models.CASCADE, related_name='detections')
    timestamp = models.DateTimeField(auto_now_add=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    trash_count = models.IntegerField(default=1)

    def __str__(self):
        return f"Detection by {self.boat.name} at {self.timestamp}"

class User(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('spearhead', 'Spearhead'),
        ('officemayor', 'Office Mayor'),
    ]

    user_id = models.CharField(max_length=8, primary_key=True)
    username = models.CharField(max_length=50, unique=True)
    password_hash = models.CharField(max_length=255)
    email = models.CharField(max_length=100, unique=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    full_name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.username

class Barangay(models.Model):
    barangay_id = models.AutoField(primary_key=True)
    barangay_name = models.CharField(max_length=100)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    spearhead_id = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='barangays')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.barangay_name

class Operator(models.Model):
    STATUS_CHOICES = [
        ('online', 'Online'),
        ('offline', 'Offline'),
        ('onleave', 'On Leave'),
    ]
    AVAILABILITY_CHOICES = [
        ('Assigned', 'Assigned'),
        ('Available', 'Available'),
        ('Unavailable', 'Unavailable'),
    ]
    name = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='online')
    availability = models.CharField(max_length=20, choices=AVAILABILITY_CHOICES, default='Available')

    def __str__(self):
        return self.name

class CleanupRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('scheduled', 'Scheduled'),
    ]
    MEDIA_TYPE_CHOICES = [
        ('image', 'Image'),
        ('video', 'Video'),
    ]
    request_id = models.AutoField(primary_key=True)
    spearhead = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cleanup_requests')
    barangay = models.ForeignKey(Barangay, on_delete=models.CASCADE)
    description = models.TextField()
    media_type = models.CharField(max_length=20, choices=MEDIA_TYPE_CHOICES, default='image')
    media = models.FileField(upload_to='cleanup_requests/', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    admin_note = models.TextField(blank=True)

    def __str__(self):
        return f"Request #{self.request_id} by {self.spearhead.username}"

class ScheduledCleanup(models.Model):
    schedule_id = models.AutoField(primary_key=True)
    request = models.ForeignKey(CleanupRequest, on_delete=models.CASCADE, related_name='schedules')
    scheduled_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Schedule #{self.schedule_id} for Request #{self.request_id}"

class ScheduledBot(models.Model):
    id = models.AutoField(primary_key=True)
    schedule = models.ForeignKey(ScheduledCleanup, on_delete=models.CASCADE, related_name='scheduled_bots')
    bot = models.ForeignKey(Boat, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.bot.name} in Schedule #{self.schedule_id}"
