import base64
import binascii
import os

from rest_framework import serializers
from . import boundaries
from .models import Boat, DetectionEvent, User, Operator, Request, StatusHistory, Photo, DeploymentSchedule, PriorityArea, LandfillRecord, RecyclingRecord, SegregationRecord, AuditLog, HeatmapData, CollectionArea, Notification

LETTER_MAX_BYTES = 5 * 1024 * 1024
# Extension -> (content type, the bytes a real file of that type starts with).
LETTER_TYPES = {
    '.pdf': ('application/pdf', b'%PDF-'),
    '.doc': ('application/msword', b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'),
    '.docx': ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', b'PK\x03\x04'),
}

class LetterUploadSerializer(serializers.Serializer):
    """A request's letter: a PDF or Word file sent as base64 (a data URL is fine)."""
    name = serializers.CharField(max_length=255)
    data = serializers.CharField(max_length=LETTER_MAX_BYTES * 2)

    def validate(self, attrs):
        name = attrs['name'].replace('\\', '/').rsplit('/', 1)[-1]
        stem, extension = os.path.splitext(name)
        extension = extension.lower()
        if extension not in LETTER_TYPES:
            raise serializers.ValidationError('Only PDF or Word files can be attached.')
        content_type, signature = LETTER_TYPES[extension]

        encoded = attrs['data']
        if encoded.startswith('data:'):
            encoded = encoded.split(',', 1)[-1]
        try:
            content = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            raise serializers.ValidationError('The file could not be read.')
        if len(content) > LETTER_MAX_BYTES:
            raise serializers.ValidationError('The file is too large. The limit is 5 MB.')
        if not content.startswith(signature):
            raise serializers.ValidationError('The file is not a valid PDF or Word document.')

        megabytes = len(content) / (1024 * 1024)
        return {
            'file_name': f'{stem[:100 - len(extension)]}{extension}',
            'size': f'{megabytes:.1f} MB' if megabytes >= 1 else f'{max(1, round(len(content) / 1024))} KB',
            'content_type': content_type,
            'data': encoded,
        }

class TrashReportSerializer(serializers.Serializer):
    """The collected-garbage figures required to finish a cleanup. 0 is a valid answer."""
    bags = serializers.IntegerField(min_value=0)
    weight_kg = serializers.FloatField(min_value=0)
    non_usable_kg = serializers.FloatField(min_value=0)
    recyclable_kg = serializers.FloatField(min_value=0)
    trash_categories = serializers.DictField(child=serializers.IntegerField(min_value=0), allow_empty=False)
    notes = serializers.CharField(allow_blank=True, default='')

class DetectionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetectionEvent
        fields = ['id', 'boat', 'timestamp', 'latitude', 'longitude', 'trash_count', 'categories', 'confidence', 'is_verified']

class BoatSerializer(serializers.ModelSerializer):
    is_online = serializers.BooleanField(source='is_connected', read_only=True)
    # Who is using the robot right now through the Companion app (Boat.current_operator).
    in_use_by_name = serializers.SerializerMethodField()
    in_use_since = serializers.SerializerMethodField()

    class Meta:
        model = Boat
        fields = ['id', 'name', 'is_active', 'is_online', 'archived', 'last_latitude', 'last_longitude', 'battery_level',
                  'last_seen', 'in_use_by_name', 'in_use_since']

    def get_in_use_by_name(self, boat):
        operator = boat.current_operator
        return operator.name if operator else None

    def get_in_use_since(self, boat):
        return boat.in_use_since if boat.current_operator else None

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'user_id', 'name', 'email', 'role', 'status', 'location', 'date_created', 'must_change_password']

    def validate_role(self, value):
        # Operator logins come only from Operator Management (OperatorViewSet.create),
        # which links them to an operator record so they can use the Companion app.
        if value == 'operator' and getattr(self.instance, 'role', None) != 'operator':
            raise serializers.ValidationError('Add operators in Operator Management.')
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

class OperatorSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    account_status = serializers.SerializerMethodField()

    def get_email(self, obj):
        return obj.user.email if obj.user else None

    def get_account_status(self, obj):
        return obj.user.status if obj.user else None

    class Meta:
        model = Operator
        fields = ['id', 'operator_id', 'name', 'status', 'assigned_bot', 'availability', 'archived', 'user', 'email', 'account_status']
        extra_kwargs = {
            'operator_id': {'required': False, 'allow_blank': True},
            'user': {'read_only': True},
        }

class StatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StatusHistory
        fields = ['id', 'request', 'label', 'date', 'actor', 'role', 'state', 'details']

class PhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = ['id', 'request', 'photo_id', 'label', 'date', 'image_data']

class RequestSerializer(serializers.ModelSerializer):
    status_history = StatusHistorySerializer(many=True, read_only=True)
    photos = PhotoSerializer(many=True, read_only=True)
    collection_area = serializers.PrimaryKeyRelatedField(
        queryset=CollectionArea.objects.all(), required=False, allow_null=True
    )
    collection_area_detail = serializers.SerializerMethodField()

    def get_collection_area_detail(self, obj):
        if not obj.collection_area:
            return None
        return {
            'id': obj.collection_area.id,
            'area_id': obj.collection_area.area_id,
            'name': obj.collection_area.name,
        }

    class Meta:
        model = Request
        fields = ['id', 'request_id', 'request_type', 'status', 'date_submitted', 'requested_by_name', 'requested_by_role', 'requested_by_barangay', 'contact', 'email', 'location_name', 'barangay', 'municipality', 'province', 'preferred_date', 'preferred_time', 'notes', 'decline_reason', 'parked_from_status', 'letter_file_name', 'letter_size', 'letter_content_type', 'bot_id', 'operator', 'collection_area', 'collection_area_detail', 'bags', 'weight_kg', 'non_usable_kg', 'recyclable_kg', 'session_completed_at', 'trash_categories', 'verified_categories', 'verification_notes', 'verified_at', 'archived', 'status_history', 'photos']
        extra_kwargs = {
            'request_id': {'required': False, 'allow_blank': True},
            'letter_file_name': {'read_only': True},
            'letter_size': {'read_only': True},
            'letter_content_type': {'read_only': True},
            'decline_reason': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'requested_by_name': {'required': False, 'allow_blank': True},
            'requested_by_role': {'required': False, 'allow_blank': True},
            'contact': {'required': False, 'allow_blank': True},
            'location_name': {'required': False, 'allow_blank': True},
            'requested_by_barangay': {'required': False, 'allow_blank': True},
            'barangay': {'required': False, 'allow_blank': True},
            'municipality': {'required': False, 'allow_blank': True},
            'province': {'required': False, 'allow_blank': True},
            'preferred_date': {'required': False, 'allow_blank': True},
            'preferred_time': {'required': False, 'allow_blank': True},
        }

class DeploymentScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeploymentSchedule
        fields = ['id', 'bot', 'day', 'status', 'label', 'zone', 'request_id', 'cleanup_type']

class PriorityAreaSerializer(serializers.ModelSerializer):
    bot_name = serializers.SerializerMethodField()

    def get_bot_name(self, obj):
        return obj.bot.name if obj.bot else None

    class Meta:
        model = PriorityArea
        fields = ['id', 'barangay', 'total_bags', 'window_days', 'identified_at', 'deployment_schedule', 'bot', 'bot_name', 'scheduled_day']

class LandfillRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandfillRecord
        fields = ['id', 'record_id', 'barangay', 'date', 'bags', 'weight_kg', 'bot', 'operator', 'vehicle', 'disposed_by']

class RecyclingRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecyclingRecord
        fields = ['id', 'record_id', 'barangay', 'date', 'bags', 'weight_kg', 'category', 'bot', 'operator', 'buyer', 'sold_at']

class SegregationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SegregationRecord
        fields = ['id', 'zone', 'date', 'total_bags', 'total_weight_kg', 'non_usable_weight_kg', 'recyclable_weight_kg', 'notes', 'created_at']

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ['id', 'time', 'user', 'role', 'action', 'details', 'module', 'ip', 'status']
        extra_kwargs = {
            'time': {'required': False, 'allow_blank': True},
            'ip': {'required': False, 'allow_blank': True},
        }


class CollectionAreaSerializer(serializers.ModelSerializer):
    # Only CENRO (admin) reviews areas; anyone else's values for these are ignored.
    REVIEW_FIELDS = ('status', 'decline_reason', 'reviewed_by', 'date_reviewed')

    def validate(self, attrs):
        request = self.context.get('request')
        if getattr(getattr(request, 'user', None), 'role', None) != 'admin':
            for field in self.REVIEW_FIELDS:
                attrs.pop(field, None)

        area = self.instance
        # Renaming or recolouring an area leaves its shape alone, so only check a new or reshaped one.
        if area is not None and not {'points', 'barangay', 'closed'} & attrs.keys():
            return attrs
        barangay = attrs.get('barangay', area.barangay if area else '')
        points = attrs.get('points', area.points if area else [])
        closed = attrs.get('closed', area.closed if area else True)

        official = boundaries.canonical_barangay(barangay)
        if not official:
            raise serializers.ValidationError({'barangay': f'"{barangay}" is not a barangay of San Fernando.'})
        attrs['barangay'] = official
        if not isinstance(points, list) or not all(
            isinstance(p, (list, tuple)) and len(p) == 2
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in p)
            for p in points
        ):
            raise serializers.ValidationError({'points': 'Points must be [latitude, longitude] pairs.'})
        if len(points) < (3 if closed else 2):
            raise serializers.ValidationError({'points': 'Draw at least 3 points for an area, or 2 for a line.'})
        problem = boundaries.check_area(points, official)
        if problem:
            raise serializers.ValidationError({'points': problem})
        return attrs

    class Meta:
        model = CollectionArea
        fields = ['id', 'area_id', 'name', 'barangay', 'submitted_by', 'points', 'closed', 'color', 'status', 'decline_reason', 'reviewed_by', 'date_submitted', 'date_reviewed', 'archived']
        extra_kwargs = {
            'area_id': {'required': False, 'allow_blank': True},
            'decline_reason': {'required': False, 'allow_blank': True},
            'reviewed_by': {'required': False, 'allow_blank': True},
            'barangay': {'required': False, 'allow_blank': True},
            'submitted_by': {'required': False, 'allow_blank': True},
            'color': {'required': False, 'allow_blank': True},
        }


class HeatmapDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeatmapData
        fields = ['id', 'latitude', 'longitude', 'weight', 'source_type', 'timestamp']


class NotificationSerializer(serializers.ModelSerializer):
    request_id = serializers.CharField(source='request.request_id', read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ['id', 'recipient', 'request', 'request_id', 'notif_type', 'title', 'message', 'is_read', 'created_at']
